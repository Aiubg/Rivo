import type { Attachment } from '$lib/types/attachment';
import { logger } from '$lib/utils/logger';
import { get } from 'svelte/store';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { t } from 'svelte-i18n';
import { toast } from 'svelte-sonner';
import { getFileUploadKey, uploadAttachmentFile } from '$lib/hooks/chat-state/upload';

export type ChatAttachmentUploadStateOptions = {
	getAttachments: () => Attachment[];
	setAttachments: (attachments: Attachment[]) => void;
};

export class ChatAttachmentUploadState {
	uploadQueue = new SvelteSet<string>();
	private uploadControllers = new SvelteMap<string, AbortController>();

	constructor(private options: ChatAttachmentUploadStateOptions) {}

	async uploadFile(file: File): Promise<Attachment | undefined> {
		const uploadKey = getFileUploadKey(file);
		this.uploadControllers.get(uploadKey)?.abort();
		const controller = new AbortController();
		this.uploadControllers.set(uploadKey, controller);
		try {
			const result = await uploadAttachmentFile(file, controller);
			if (result.ok) {
				return result.attachment;
			}

			if (!result.aborted) {
				toast.error(get(t)(result.errorKey));
			}
		} catch (error) {
			logger.error('Error uploading file:', error);
			toast.error(get(t)('upload.retry_failed'));
		} finally {
			if (this.uploadControllers.get(uploadKey) === controller) {
				this.uploadControllers.delete(uploadKey);
			}
		}
	}

	async handleFileChange(files: File[]) {
		const fileNames = files.map((file) => file.name);
		fileNames.forEach((name) => this.uploadQueue.add(name));
		try {
			const uploaded = await Promise.all(files.map((file) => this.uploadFile(file)));
			const okAttachments = uploaded.filter((attachment): attachment is Attachment => {
				return attachment !== undefined;
			});
			if (okAttachments.length > 0) {
				this.options.setAttachments([...this.options.getAttachments(), ...okAttachments]);
			}
		} catch (error) {
			logger.error('File upload process failed', error);
		} finally {
			fileNames.forEach((name) => this.uploadQueue.delete(name));
		}
	}
}
