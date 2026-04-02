import { tick } from 'svelte';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { toast } from 'svelte-sonner';
import {
	deleteStoredFile,
	fetchFilePreview,
	fetchStoredFiles,
	renameStoredFile,
	uploadStoredFile,
	type StoredUploadFile
} from '$lib/services/files-api';
import {
	getVisibleManagedFiles,
	mergeManagedFiles,
	normalizeManagedFiles,
	patchManagedFile,
	removeManagedFile,
	renameManagedFile,
	toManagedFile,
	type FileTypeFilter,
	type ManagedFile,
	type SortMode
} from '$lib/services/file-library';
import { getStoredUploadName, splitFileName, supportsTextPreview } from '$lib/utils/files';

export class FileLibraryState {
	files = $state<ManagedFile[]>([]);
	selectedUrl = $state<string | null>(null);
	uploadInputRef = $state<HTMLInputElement | null>(null);
	uploading = $state(false);
	refreshing = $state(false);
	activeFilter = $state<FileTypeFilter | null>(null);
	sortMode = $state<SortMode>('name');
	deleteDialogOpen = $state(false);
	fileToDelete = $state<ManagedFile | null>(null);
	renameDialogOpen = $state(false);
	fileToRename = $state<ManagedFile | null>(null);
	renameValue = $state('');
	renameExtension = $state('');
	renameInputRef = $state<HTMLInputElement | null>(null);
	openFileMenuUrl = $state<string | null>(null);

	selectedFile = $derived.by(
		() => this.files.find((file) => file.url === this.selectedUrl) ?? null
	);
	visibleFiles = $derived.by(() =>
		getVisibleManagedFiles(this.files, this.activeFilter, this.sortMode)
	);

	constructor(initialFiles: ReadonlyArray<StoredUploadFile>) {
		this.files = normalizeManagedFiles(initialFiles);
	}

	#showFileError(error: unknown, fallbackKey: string) {
		const message = error instanceof Error ? error.message : fallbackKey;
		toast.error(get(t)(message.includes('.') ? message : fallbackKey));
	}

	#patchFile(url: string, patch: Partial<ManagedFile>) {
		this.files = patchManagedFile(this.files, url, patch);
	}

	#uploadFile = async (file: File): Promise<ManagedFile | null> => {
		let data: Awaited<ReturnType<typeof uploadStoredFile>>;
		try {
			data = await uploadStoredFile(file);
		} catch (error) {
			this.#showFileError(error, 'upload.failed');
			return null;
		}
		if (
			!data ||
			typeof data.url !== 'string' ||
			typeof data.pathname !== 'string' ||
			typeof data.contentType !== 'string'
		) {
			toast.error(get(t)('upload.invalid_response'));
			return null;
		}

		const managed = toManagedFile({
			url: data.url,
			storedName: getStoredUploadName(data.url),
			originalName: data.pathname,
			contentType: data.contentType,
			size: typeof data.size === 'number' ? data.size : file.size,
			lastModified: typeof data.lastModified === 'number' ? data.lastModified : file.lastModified,
			uploadedAt: Date.now(),
			hash: typeof data.hash === 'string' ? data.hash : undefined
		});
		managed.previewContent = typeof data.content === 'string' ? data.content : undefined;
		return managed;
	};

	openUploadPicker = () => {
		this.uploadInputRef?.click();
	};

	refreshFiles = async () => {
		this.refreshing = true;
		try {
			const previousFiles = this.files;
			this.files = normalizeManagedFiles(await fetchStoredFiles(), previousFiles);
		} catch (error) {
			this.#showFileError(error, 'upload.failed');
		} finally {
			this.refreshing = false;
		}
	};

	handleUploadChange = async (event: Event & { currentTarget: HTMLInputElement }) => {
		const selectedFiles = Array.from(event.currentTarget.files ?? []);
		event.currentTarget.value = '';
		if (selectedFiles.length === 0) return;

		this.uploading = true;
		try {
			const uploaded = await Promise.all(selectedFiles.map((file) => this.#uploadFile(file)));
			const successful = uploaded.filter((file): file is ManagedFile => file !== null);
			if (successful.length === 0) return;

			this.files = mergeManagedFiles(this.files, successful);
			toast.success(get(t)('files.upload_success'));
		} finally {
			this.uploading = false;
		}
	};

	handleDelete = async (file: ManagedFile) => {
		try {
			await deleteStoredFile(file.url);
			this.files = removeManagedFile(this.files, file.url);
			toast.success(get(t)('files.delete_success'));
		} catch (error) {
			this.#showFileError(error, 'upload.delete_failed');
		}
	};

	requestDelete = (file: ManagedFile) => {
		this.openFileMenuUrl = null;
		this.fileToDelete = file;
		this.deleteDialogOpen = true;
	};

	requestRename = (file: ManagedFile) => {
		this.openFileMenuUrl = null;
		const { baseName, extension } = splitFileName(file.originalName);
		this.fileToRename = file;
		this.renameValue = baseName;
		this.renameExtension = extension;
		this.renameDialogOpen = true;
	};

	confirmDelete = async () => {
		const file = this.fileToDelete;
		if (!file) return;

		await this.handleDelete(file);
		this.deleteDialogOpen = false;
		this.fileToDelete = null;
	};

	confirmRename = async () => {
		const file = this.fileToRename;
		if (!file) return;

		const nextBaseName = this.renameValue.trim();
		if (!nextBaseName) return;
		const nextName = `${nextBaseName}${this.renameExtension}`;

		try {
			await renameStoredFile(file.url, nextName);
			this.files = renameManagedFile(this.files, file.url, nextName);
			toast.success(get(t)('files.rename_success'));
			this.renameDialogOpen = false;
			this.fileToRename = null;
		} catch {
			toast.error(get(t)('files.rename_failed'));
		}
	};

	focusRenameInput = async () => {
		await tick();
		if (!this.renameDialogOpen) return;
		this.renameInputRef?.focus();
		this.renameInputRef?.select();
	};

	loadPreview = async (file: ManagedFile) => {
		if (file.previewLoading || file.previewContent !== undefined) return;
		if (!supportsTextPreview(file.originalName || file.storedName, file.contentType)) {
			this.#patchFile(file.url, { previewContent: null, previewLoading: false });
			return;
		}

		this.#patchFile(file.url, { previewLoading: true });
		try {
			const data = await fetchFilePreview(file.url);
			this.#patchFile(file.url, {
				previewContent: data.content,
				previewLoading: false
			});
		} catch (error) {
			this.#showFileError(error, 'upload.failed');
			this.#patchFile(file.url, { previewContent: null, previewLoading: false });
		}
	};

	copySelectedFileContent = async () => {
		const file = this.selectedFile;
		if (!file || file.previewLoading) return;

		try {
			if (
				file.previewContent === undefined &&
				supportsTextPreview(file.originalName || file.storedName, file.contentType)
			) {
				await this.loadPreview(file);
			}

			const currentFile = this.files.find((item) => item.url === file.url) ?? file;
			if (typeof currentFile.previewContent !== 'string') {
				toast.error(get(t)('files.preview_not_supported'));
				return;
			}

			await navigator.clipboard.writeText(currentFile.previewContent);
			toast.success(get(t)('files.copy_content_success'));
		} catch {
			toast.error(get(t)('common.request_failed'));
		}
	};

	downloadSelectedFile = () => {
		const file = this.selectedFile;
		if (!file) return;

		const link = document.createElement('a');
		link.href = file.url;
		link.download = file.originalName;
		link.rel = 'noopener noreferrer';
		document.body.appendChild(link);
		link.click();
		link.remove();
	};

	closeSelectedPreview = () => {
		this.selectedUrl = null;
	};

	clearFilter = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		this.activeFilter = null;
	};

	syncSelectionWithVisibleFiles = () => {
		if (this.visibleFiles.length === 0) {
			this.selectedUrl = null;
			return;
		}
		if (this.selectedUrl && !this.visibleFiles.some((file) => file.url === this.selectedUrl)) {
			this.selectedUrl = null;
		}
	};

	ensureSelectedPreviewLoaded = async () => {
		const file = this.selectedFile;
		if (!file) return;
		if (file.previewLoading || file.previewContent !== undefined) return;
		await this.loadPreview(file);
	};

	syncDeleteDialogState = () => {
		if (!this.deleteDialogOpen) {
			this.fileToDelete = null;
		}
	};

	syncRenameDialogState = async () => {
		if (!this.renameDialogOpen) {
			this.fileToRename = null;
			this.renameExtension = '';
			this.openFileMenuUrl = null;
			return;
		}

		await this.focusRenameInput();
	};
}
