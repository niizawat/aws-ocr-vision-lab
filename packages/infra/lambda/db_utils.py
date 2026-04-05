"""Job metadata management using DuckDB + S3 Parquet"""
import duckdb
import json
import os
import tempfile
import boto3
from datetime import datetime

BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

s3 = boto3.client("s3", region_name=REGION)

def _get_parquet_key(user_id: str) -> str:
    return f"{user_id}/jobs.parquet"

def _download_parquet(user_id: str, local_path: str) -> bool:
    """Download user's jobs.parquet from S3. Returns False if not found."""
    try:
        s3.download_file(BUCKET_NAME, _get_parquet_key(user_id), local_path)
        return True
    except s3.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        raise
    except Exception:
        return False

def _upload_parquet(user_id: str, local_path: str):
    """Upload user's jobs.parquet to S3."""
    s3.upload_file(local_path, BUCKET_NAME, _get_parquet_key(user_id))

def add_job(user_id: str, job_id: str, filename: str, s3_key: str, model: str, model_options: dict):
    """Add a new job to the user's metadata."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "jobs.parquet")
        exists = _download_parquet(user_id, parquet_path)

        con = duckdb.connect()
        if exists:
            con.execute(f"CREATE TABLE jobs AS SELECT * FROM read_parquet('{parquet_path}')")
        else:
            con.execute("""
                CREATE TABLE jobs (
                    id VARCHAR,
                    filename VARCHAR,
                    s3_key VARCHAR,
                    model VARCHAR,
                    model_options VARCHAR,
                    status VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

        now = datetime.utcnow().isoformat() + "Z"
        con.execute(
            "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [job_id, filename, s3_key, model, json.dumps(model_options), "processing", now, now]
        )
        con.execute(f"COPY jobs TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)

def update_job_status(user_id: str, job_id: str, status: str):
    """Update a job's status."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "jobs.parquet")
        if not _download_parquet(user_id, parquet_path):
            return

        con = duckdb.connect()
        con.execute(f"CREATE TABLE jobs AS SELECT * FROM read_parquet('{parquet_path}')")
        now = datetime.utcnow().isoformat() + "Z"
        con.execute("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", [status, now, job_id])
        con.execute(f"COPY jobs TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)

def list_jobs(user_id: str) -> list:
    """List all jobs for a user, sorted by created_at descending."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "jobs.parquet")
        if not _download_parquet(user_id, parquet_path):
            return []

        con = duckdb.connect()
        result = con.execute(f"""
            SELECT id, filename, s3_key, model, model_options, status, created_at
            FROM read_parquet('{parquet_path}')
            ORDER BY created_at DESC
        """).fetchall()
        con.close()

        jobs = []
        for row in result:
            created_at = row[6]
            if hasattr(created_at, 'isoformat'):
                created_at = created_at.isoformat() + "Z"
            jobs.append({
                "id": row[0],
                "filename": row[1],
                "s3Key": row[2],
                "model": row[3],
                "modelOptions": json.loads(row[4]) if row[4] else {},
                "status": row[5],
                "createdAt": str(created_at),
            })
        return jobs

def delete_job(user_id: str, job_id: str):
    """Delete a job from the user's metadata."""
    with tempfile.TemporaryDirectory() as tmpdir:
        parquet_path = os.path.join(tmpdir, "jobs.parquet")
        if not _download_parquet(user_id, parquet_path):
            return

        con = duckdb.connect()
        con.execute(f"CREATE TABLE jobs AS SELECT * FROM read_parquet('{parquet_path}')")
        con.execute("DELETE FROM jobs WHERE id = ?", [job_id])
        con.execute(f"COPY jobs TO '{parquet_path}' (FORMAT PARQUET)")
        con.close()
        _upload_parquet(user_id, parquet_path)
