type UploadMetadataOwnership = {
	userId?: string | null;
	anonymousSessionId?: string | null;
};

export type UploadAccessScope =
	| { type: 'user'; userId: string }
	| { type: 'anonymous'; anonymousSessionId: string }
	| { type: 'unscoped' };

export function getUploadAccessScope(locals: App.Locals): UploadAccessScope {
	if (locals.user?.id) {
		return {
			type: 'user',
			userId: locals.user.id
		};
	}

	if (locals.anonymousSessionId) {
		return {
			type: 'anonymous',
			anonymousSessionId: locals.anonymousSessionId
		};
	}

	return { type: 'unscoped' };
}

export function applyUploadOwnership<T extends object>(
	entry: T,
	scope: UploadAccessScope
): T & UploadMetadataOwnership {
	if (scope.type === 'user') {
		return {
			...entry,
			userId: scope.userId,
			anonymousSessionId: null
		};
	}

	if (scope.type === 'anonymous') {
		return {
			...entry,
			userId: null,
			anonymousSessionId: scope.anonymousSessionId
		};
	}

	return {
		...entry,
		userId: null,
		anonymousSessionId: null
	};
}

export function matchesUploadOwnership(
	metadata: UploadMetadataOwnership | undefined,
	scope: UploadAccessScope
): boolean {
	if (!metadata) {
		return false;
	}

	if (scope.type === 'user') {
		return metadata.userId === scope.userId;
	}

	if (scope.type === 'anonymous') {
		return metadata.anonymousSessionId === scope.anonymousSessionId;
	}

	return false;
}
