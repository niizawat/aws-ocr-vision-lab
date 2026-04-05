import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from './useRuntimeConfig';
import { OcrJob, OcrModel, ModelOptions } from '../types/ocr';

export interface UseOcrApiReturn {
  fetchJobs: () => Promise<OcrJob[]>;
  deleteS3Files: (s3Key: string, jobId: string) => Promise<void>;
  fetchS3ImageUrl: (s3Key: string) => Promise<string | null>;
  fetchJobResult: (jobId: string) => Promise<OcrJob['result'] | null>;
}

export function useOcrApi(): UseOcrApiReturn {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const apiUrl = runtimeConfig.apiUrl || runtimeConfig.apis?.ocr;

  const fetchJobs = useCallback(async (): Promise<OcrJob[]> => {
    if (!apiUrl || !auth.user?.id_token) return [];
    try {
      const response = await fetch(`${apiUrl}/jobs`, {
        method: 'GET',
        headers: {
          Authorization: auth.user.id_token,
        },
      });
      if (!response.ok) {
        console.error('Failed to fetch jobs:', response.statusText);
        return [];
      }
      const data = await response.json();
      // Convert API response to OcrJob format
      const fetchedJobs: OcrJob[] = data.jobs.map((job: {
        id: string;
        filename: string;
        s3Key: string;
        createdAt: string;
        model: string;
        modelOptions: ModelOptions;
        status: string;
      }) => ({
        id: job.id,
        filename: job.filename,
        s3Key: job.s3Key,
        createdAt: new Date(job.createdAt),
        model: job.model as OcrModel,
        modelOptions: job.modelOptions,
        status: job.status as OcrJob['status'],
        imageAvailable: true, // Assume available, will be checked when loading
      }));
      return fetchedJobs;
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      return [];
    }
  }, [apiUrl, auth.user?.id_token]);

  const deleteS3Files = useCallback(
    async (s3Key: string, jobId: string) => {
      if (!apiUrl || !auth.user?.id_token) return;
      try {
        // Encode each path segment to handle Korean filenames and special characters
        const encodedS3Key = s3Key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        // Pass jobId as query parameter for output deletion
        const response = await fetch(`${apiUrl}/image/${encodedS3Key}?job_id=${jobId}`, {
          method: 'DELETE',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          console.error('Failed to delete S3 files:', response.statusText);
        }
      } catch (error) {
        console.error('Failed to delete S3 files:', error);
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  const fetchS3ImageUrl = useCallback(
    async (s3Key: string): Promise<string | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        // Encode each path segment to handle Korean filenames and special characters
        const encodedS3Key = s3Key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const response = await fetch(`${apiUrl}/image/${encodedS3Key}`, {
          method: 'GET',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          if (response.status === 404) {
            return null; // Image not found
          }
          throw new Error(`Failed to fetch image URL: ${response.statusText}`);
        }
        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error('Failed to fetch S3 image URL:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  const fetchJobResult = useCallback(
    async (jobId: string): Promise<OcrJob['result'] | null> => {
      if (!apiUrl || !auth.user?.id_token) return null;
      try {
        const response = await fetch(`${apiUrl}/ocr/${jobId}`, {
          method: 'GET',
          headers: {
            Authorization: auth.user.id_token,
          },
        });
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        if (data.status === 'completed' && data.result) {
          return data.result;
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch job result:', error);
        return null;
      }
    },
    [apiUrl, auth.user?.id_token],
  );

  return { fetchJobs, deleteS3Files, fetchS3ImageUrl, fetchJobResult };
}
