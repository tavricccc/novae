"use client";

import * as React from "react";
import { toast } from "sonner";
import { processImageForUpload } from "@/lib/image-processing";
import {
  createImageUploadPolicies,
  deleteUploadedImages,
} from "@/services/uploads";
import type { ImageUploadTargetType } from "@/services/uploads";
import { useI18n } from "@/i18n";
import type { ImageUploadSettings } from "@/types/categories";

interface PreparedImage {
  file: File;
  height: number;
  previewUrl: string;
  width: number;
}

interface UploadedImage {
  height: number;
  storagePath: string;
  uploadId: string;
  url: string;
  width: number;
}

export function useImageAttachments(
  targetType: ImageUploadTargetType,
  settings: ImageUploadSettings,
) {
  const maxImages = targetType === "issue"
    ? settings.issueMaxImages
    : targetType === "facility"
      ? settings.facilityMaxImages
      : targetType === "announcement"
        ? settings.announcementMaxImages
        : settings.commentMaxImages;
  const { t } = useI18n();
  const [images, setImages] = React.useState<PreparedImage[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const imagesRef = React.useRef(images);
  const preparationRef = React.useRef<symbol | null>(null);
  const [preparing, setPreparing] = React.useState(false);

  React.useEffect(
    () => () => {
      preparationRef.current = null;
      imagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      );
    },
    [],
  );

  const pick = React.useCallback(
    async (files: FileList | null) => {
      if (!files?.length || preparationRef.current) return;
      const remaining = Math.max(0, maxImages - imagesRef.current.length);
      if (remaining === 0) {
        toast.error(t("upload.imageLimit", { count: maxImages }));
        return;
      }
      const preparation = Symbol();
      preparationRef.current = preparation;
      setPreparing(true);
      const prepared: PreparedImage[] = [];
      try {
        for (const file of Array.from(files).slice(0, remaining)) {
          const result = await processImageForUpload(file, settings);
          if (preparationRef.current !== preparation) return;
          prepared.push({
            ...result,
            previewUrl: URL.createObjectURL(result.file),
          });
        }
        imagesRef.current = [...imagesRef.current, ...prepared];
        setImages(imagesRef.current);
        if (files.length > remaining)
          toast.error(t("upload.imageLimit", { count: maxImages }));
      } catch (error) {
        if (preparationRef.current === preparation) toast.error(
          t(
            error instanceof Error
              ? error.message
              : "image.imageProcessingFailedPleaseTryAgainLater",
          ),
        );
      } finally {
        // Uncommitted previews belong to this batch, including canceled batches.
        prepared.filter((image) => !imagesRef.current.includes(image))
          .forEach((image) => URL.revokeObjectURL(image.previewUrl));
        if (preparationRef.current === preparation) {
          preparationRef.current = null;
          setPreparing(false);
        }
      }
    },
    [maxImages, settings, t],
  );

  const remove = React.useCallback((index: number) => {
    const target = imagesRef.current[index];
    if (target) URL.revokeObjectURL(target.previewUrl);
    imagesRef.current = imagesRef.current.filter((_, currentIndex) => currentIndex !== index);
    setImages(imagesRef.current);
  }, []);

  const clear = React.useCallback(() => {
    preparationRef.current = null;
    setPreparing(false);
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    imagesRef.current = [];
    setImages([]);
  }, []);

  const uploadAndAppend = React.useCallback(async (content: string) => {
    const selectedImages = imagesRef.current;
    if (selectedImages.length === 0)
      return { content: content.trim(), uploaded: [] as UploadedImage[] };
    setUploading(true);
    let uploaded: UploadedImage[] = [];
    try {
      const policies = await createImageUploadPolicies(
        selectedImages.map(({ file, height, width }) => ({
          file,
          height,
          width,
        })),
        targetType,
      );
      uploaded = policies.map(({ height, storagePath, uploadId, width }) => ({
        height,
        storagePath,
        uploadId,
        url: `srp-upload://${uploadId}`,
        width,
      }));
      if (uploaded.length !== selectedImages.length)
        throw new Error("markdown.imageUploadFailed");
      const imageMarkdown = uploaded
        .map((image) => `![image|${image.width}x${image.height}](${image.url})`)
        .join("\n");
      const body = content.trimEnd();
      return {
        content: body ? `${body}\n\n${imageMarkdown}` : imageMarkdown,
        uploaded,
      };
    } catch (error) {
      if (uploaded.length > 0)
        await deleteUploadedImages(
          uploaded.map((image) => image.storagePath),
        ).catch(() => undefined);
      throw error;
    } finally {
      setUploading(false);
    }
  }, [targetType]);

  return { clear, images, pick, remove, uploadAndAppend, uploading: preparing || uploading };
}
