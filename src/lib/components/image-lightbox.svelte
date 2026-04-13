<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { onDestroy, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { Button } from '$lib/components/ui/button';
	import { AlertDialog, AlertDialogContent } from '$lib/components/ui/alert-dialog';

	type Point = { x: number; y: number };
	type Size = { width: number; height: number };
	type DragState = {
		point: Point;
		translateX: number;
		translateY: number;
	};
	type PinchState = {
		distance: number;
		scale: number;
		midpoint: Point;
		translateX: number;
		translateY: number;
	};

	let {
		open = $bindable(false),
		src = null,
		alt = ''
	}: {
		open?: boolean;
		src?: string | null;
		alt?: string;
	} = $props();

	const maxScale = 6;
	const activePointers = new SvelteMap<number, Point>();

	let viewportEl = $state<HTMLDivElement | null>(null);
	let naturalSize = $state<Size | null>(null);
	let fittedSize = $state<Size | null>(null);
	let scale = $state(1);
	let translateX = $state(0);
	let translateY = $state(0);
	let isInteracting = $state(false);
	let isReady = $state(false);
	let fitFrame: number | null = null;
	let dragState = $state<DragState | null>(null);
	let pinchState = $state<PinchState | null>(null);

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function getViewportRect() {
		return viewportEl?.getBoundingClientRect() ?? null;
	}

	function getOffsetFromCenter(point: Point, rect: DOMRect) {
		return {
			x: point.x - rect.left - rect.width / 2,
			y: point.y - rect.top - rect.height / 2
		};
	}

	function distanceBetween(a: Point, b: Point) {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function midpointBetween(a: Point, b: Point): Point {
		return {
			x: (a.x + b.x) / 2,
			y: (a.y + b.y) / 2
		};
	}

	function getFirstTwoPointers() {
		const iterator = activePointers.values();
		const first = iterator.next().value;
		const second = iterator.next().value;
		if (!first || !second) return null;
		return [first, second] as const;
	}

	function resetInteraction(resetTransform = true) {
		activePointers.clear();
		dragState = null;
		pinchState = null;
		isInteracting = false;

		if (resetTransform) {
			scale = 1;
			translateX = 0;
			translateY = 0;
		}
	}

	function clampTranslation(nextX: number, nextY: number, nextScale = scale) {
		const rect = getViewportRect();
		if (!rect || !fittedSize) {
			return { x: nextX, y: nextY };
		}

		const contentWidth = fittedSize.width * nextScale;
		const contentHeight = fittedSize.height * nextScale;
		const maxX = Math.max((contentWidth - rect.width) / 2, 0);
		const maxY = Math.max((contentHeight - rect.height) / 2, 0);

		return {
			x: clamp(nextX, -maxX, maxX),
			y: clamp(nextY, -maxY, maxY)
		};
	}

	async function fitToViewport() {
		const rect = getViewportRect();
		if (!open || !rect || !naturalSize) return;

		const availableWidth = Math.max(rect.width - 32, 80);
		const availableHeight = Math.max(rect.height - 32, 80);
		const fitScale = Math.min(
			availableWidth / naturalSize.width,
			availableHeight / naturalSize.height,
			1
		);

		fittedSize = {
			width: naturalSize.width * fitScale,
			height: naturalSize.height * fitScale
		};
		resetInteraction();
		isReady = true;
	}

	function scheduleFit() {
		if (fitFrame) {
			cancelAnimationFrame(fitFrame);
		}

		void tick().then(() => {
			fitFrame = requestAnimationFrame(() => {
				fitFrame = null;
				void fitToViewport();
			});
		});
	}

	function handleImageLoad(event: Event) {
		const target = event.currentTarget as HTMLImageElement | null;
		if (!target) return;

		naturalSize = {
			width: Math.max(target.naturalWidth || target.width, 1),
			height: Math.max(target.naturalHeight || target.height, 1)
		};
		isReady = false;
		scheduleFit();
	}

	function applyScaleAtPoint(nextScale: number, point: Point, baseScale = scale) {
		const rect = getViewportRect();
		if (!rect || baseScale <= 0) return;

		const offset = getOffsetFromCenter(point, rect);
		const nextX = offset.x - (nextScale / baseScale) * (offset.x - translateX);
		const nextY = offset.y - (nextScale / baseScale) * (offset.y - translateY);
		const clamped = clampTranslation(nextX, nextY, nextScale);

		scale = nextScale;
		translateX = nextScale === 1 ? 0 : clamped.x;
		translateY = nextScale === 1 ? 0 : clamped.y;
	}

	function handleWheel(event: WheelEvent) {
		if (!isReady || !fittedSize || !src) return;
		if (event.cancelable) {
			event.preventDefault();
		}

		const nextScale = clamp(scale * (event.deltaY < 0 ? 1.12 : 0.88), 1, maxScale);
		if (Math.abs(nextScale - scale) < 0.001) return;

		applyScaleAtPoint(nextScale, { x: event.clientX, y: event.clientY });
	}

	function handlePointerDown(event: PointerEvent) {
		if (!src || !viewportEl) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		viewportEl.setPointerCapture(event.pointerId);
		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		isInteracting = true;

		if (activePointers.size === 1) {
			dragState = {
				point: { x: event.clientX, y: event.clientY },
				translateX,
				translateY
			};
			pinchState = null;
			return;
		}

		if (activePointers.size === 2) {
			const points = getFirstTwoPointers();
			if (!points) return;
			const [first, second] = points;
			pinchState = {
				distance: Math.max(distanceBetween(first, second), 1),
				scale,
				midpoint: midpointBetween(first, second),
				translateX,
				translateY
			};
			dragState = null;
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (!activePointers.has(event.pointerId) || !fittedSize || !viewportEl) return;

		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (activePointers.size === 2) {
			const points = getFirstTwoPointers();
			if (!points) return;
			const [first, second] = points;
			if (!pinchState) {
				pinchState = {
					distance: Math.max(distanceBetween(first, second), 1),
					scale,
					midpoint: midpointBetween(first, second),
					translateX,
					translateY
				};
			}

			const rect = getViewportRect();
			if (!rect || !pinchState) return;

			const currentMidpoint = midpointBetween(first, second);
			const startOffset = getOffsetFromCenter(pinchState.midpoint, rect);
			const currentOffset = getOffsetFromCenter(currentMidpoint, rect);
			const currentDistance = Math.max(distanceBetween(first, second), 1);
			const nextScale = clamp(
				(pinchState.scale * currentDistance) / pinchState.distance,
				1,
				maxScale
			);
			const nextX =
				currentOffset.x - (nextScale / pinchState.scale) * (startOffset.x - pinchState.translateX);
			const nextY =
				currentOffset.y - (nextScale / pinchState.scale) * (startOffset.y - pinchState.translateY);
			const clamped = clampTranslation(nextX, nextY, nextScale);

			scale = nextScale;
			translateX = nextScale === 1 ? 0 : clamped.x;
			translateY = nextScale === 1 ? 0 : clamped.y;
			return;
		}

		if (activePointers.size === 1 && dragState) {
			const point = activePointers.get(event.pointerId);
			if (!point) return;

			const nextX = dragState.translateX + (point.x - dragState.point.x);
			const nextY = dragState.translateY + (point.y - dragState.point.y);
			const clamped = clampTranslation(nextX, nextY);

			translateX = scale === 1 ? 0 : clamped.x;
			translateY = scale === 1 ? 0 : clamped.y;
		}
	}

	function handlePointerRelease(event: PointerEvent) {
		activePointers.delete(event.pointerId);
		if (viewportEl?.hasPointerCapture(event.pointerId)) {
			viewportEl.releasePointerCapture(event.pointerId);
		}

		if (activePointers.size === 0) {
			dragState = null;
			pinchState = null;
			isInteracting = false;
			if (scale === 1) {
				translateX = 0;
				translateY = 0;
			}
			return;
		}

		if (activePointers.size === 1) {
			const point = activePointers.values().next().value;
			if (!point) return;
			dragState = {
				point,
				translateX,
				translateY
			};
			pinchState = null;
		}
	}

	function preventNativeDrag(event: DragEvent) {
		event.preventDefault();
	}

	$effect(() => {
		const currentSrc = src;
		naturalSize = null;
		fittedSize = null;
		isReady = false;
		resetInteraction();
		if (!currentSrc) {
			return;
		}
	});

	$effect(() => {
		if (!open || !src) {
			resetInteraction();
			return;
		}

		scheduleFit();
		const handleResize = () => scheduleFit();
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	onDestroy(() => {
		if (fitFrame) {
			cancelAnimationFrame(fitFrame);
		}
	});
</script>

<AlertDialog bind:open>
	<AlertDialogContent
		class="fixed! inset-0! w-screen! max-w-none! translate-x-0! translate-y-0! gap-0! border-0! bg-black! p-0! shadow-none!"
	>
		<div class="relative h-dvh w-full bg-black">
			<Button
				variant="ghost"
				size="icon"
				class="bg-background/85 text-foreground hover:bg-background absolute top-4 right-4 z-20 rounded-full shadow-lg backdrop-blur"
				aria-label={$t('common.close')}
				onclick={() => (open = false)}
			>
				<XIcon class="size-5 stroke-2" />
			</Button>

			<div
				bind:this={viewportEl}
				class="relative flex h-full w-full touch-none items-center justify-center overflow-hidden p-4 sm:p-8"
				class:cursor-grabbing={isInteracting}
				class:cursor-grab={isReady && !isInteracting && scale > 1}
				class:cursor-zoom-in={isReady && scale === 1}
				role="img"
				aria-label={alt || $t('chat.preview')}
				onwheel={handleWheel}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerRelease}
				onpointercancel={handlePointerRelease}
				onlostpointercapture={handlePointerRelease}
				ondragstart={preventNativeDrag}
				ondragover={preventNativeDrag}
				ondrop={preventNativeDrag}
			>
				{#if src}
					<div
						class="absolute top-1/2 left-1/2 origin-center will-change-transform"
						style:width={fittedSize ? `${fittedSize.width}px` : undefined}
						style:height={fittedSize ? `${fittedSize.height}px` : undefined}
						style:transform={`translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${scale})`}
						style:transition={isInteracting ? 'none' : 'transform 0.18s ease-out'}
					>
						<img
							{src}
							{alt}
							class="pointer-events-none block h-full w-full object-contain select-none [-webkit-user-drag:none] [user-drag:none]"
							loading="eager"
							draggable="false"
							onload={handleImageLoad}
							ondragstart={preventNativeDrag}
						/>
					</div>
				{/if}

				{#if src && !isReady}
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div
							class="flex-center flex-col gap-2 rounded-full bg-black/10 px-6 py-4 backdrop-blur-sm"
						>
							<div
								class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
							></div>
							<span class="text-muted-foreground text-sm">{$t('common.loading')}</span>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</AlertDialogContent>
</AlertDialog>
