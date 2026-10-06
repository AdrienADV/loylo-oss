import { useEffect, useRef, useState } from "react";

/**
 * Reads QR codes with the camera. Uses the browser's `BarcodeDetector` when it
 * reads QR codes, and the `jsqr` decoder otherwise (Safari, Firefox, desktop
 * Chrome), loaded only then.
 */

type QrDetector = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorApi {
	getSupportedFormats(): Promise<string[]>;
	new (options: {
		formats: string[];
	}): {
		detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
	};
}

/** Frames are scaled down to this size before decoding: enough for a pass. */
const MAX_DECODE_SIZE = 640;
const SCAN_INTERVAL_MS = 200;
/** The same code is only reported again after this delay. */
const REPEAT_DELAY_MS = 3000;

async function createQrDetector(): Promise<QrDetector> {
	const { BarcodeDetector } = window as unknown as {
		BarcodeDetector?: BarcodeDetectorApi;
	};
	if (BarcodeDetector) {
		const formats = await BarcodeDetector.getSupportedFormats();
		if (formats.includes("qr_code")) {
			const detector = new BarcodeDetector({ formats: ["qr_code"] });
			return async (video) =>
				(await detector.detect(video))[0]?.rawValue ?? null;
		}
	}

	const { default: jsQR } = await import("jsqr");
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) {
		throw new Error("This browser cannot read QR codes.");
	}
	return async (video) => {
		const scale = Math.min(
			1,
			MAX_DECODE_SIZE / Math.max(video.videoWidth, video.videoHeight),
		);
		canvas.width = Math.round(video.videoWidth * scale);
		canvas.height = Math.round(video.videoHeight * scale);
		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		const image = context.getImageData(0, 0, canvas.width, canvas.height);
		return (
			jsQR(image.data, image.width, image.height, {
				inversionAttempts: "dontInvert",
			})?.data ?? null
		);
	};
}

function cameraErrorMessage(error: unknown): string {
	if (error instanceof DOMException) {
		if (error.name === "NotAllowedError") {
			return "Camera access was denied. Allow it in your browser's settings, or enter the card code below.";
		}
		if (error.name === "NotFoundError") {
			return "No camera was found. Enter the card code below.";
		}
	}
	return "The camera could not start. Enter the card code below.";
}

export function QrScanner({
	onScan,
	paused,
}: {
	/** Called with each code read; not called while `paused`. */
	onScan: (value: string) => Promise<void>;
	paused: boolean;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const onScanRef = useRef(onScan);
	const pausedRef = useRef(paused);
	const [problem, setProblem] = useState<string | null>(null);
	const [scanning, setScanning] = useState(false);

	useEffect(() => {
		onScanRef.current = onScan;
		pausedRef.current = paused;
	});

	useEffect(() => {
		let stopped = false;
		let stream: MediaStream | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;

		function stopCamera() {
			for (const track of stream?.getTracks() ?? []) {
				track.stop();
			}
		}

		async function start() {
			const video = videoRef.current;
			if (!video) {
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia) {
				setProblem(
					"This browser cannot use the camera here. Enter the card code below.",
				);
				return;
			}

			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment" },
					audio: false,
				});
			} catch (error) {
				setProblem(cameraErrorMessage(error));
				return;
			}
			if (stopped) {
				stopCamera();
				return;
			}

			let detect: QrDetector;
			try {
				video.srcObject = stream;
				await video.play();
				detect = await createQrDetector();
			} catch (error) {
				stopCamera();
				setProblem(cameraErrorMessage(error));
				return;
			}
			setScanning(true);

			let last = { value: "", at: 0 };
			const scan = async () => {
				if (stopped) {
					return;
				}
				if (
					!pausedRef.current &&
					video.readyState >= video.HAVE_CURRENT_DATA &&
					video.videoWidth > 0
				) {
					const value = await detect(video).catch(() => null);
					const now = Date.now();
					if (
						value &&
						(value !== last.value || now - last.at > REPEAT_DELAY_MS)
					) {
						last = { value, at: now };
						await onScanRef.current(value);
					}
				}
				timer = setTimeout(scan, SCAN_INTERVAL_MS);
			};
			void scan();
		}

		void start();
		return () => {
			stopped = true;
			clearTimeout(timer);
			stopCamera();
		};
	}, []);

	if (problem) {
		return (
			<output className="block rounded-2xl bg-muted px-4 py-3 text-sm">
				{problem}
			</output>
		);
	}

	return (
		<div className="relative overflow-hidden rounded-2xl bg-black">
			<video
				ref={videoRef}
				muted
				playsInline
				aria-label="Camera"
				className="aspect-square w-full object-cover"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80"
			/>
			{scanning ? null : (
				<p className="absolute inset-x-0 bottom-4 text-center text-sm text-white">
					Starting the camera…
				</p>
			)}
		</div>
	);
}
