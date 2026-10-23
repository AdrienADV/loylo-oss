import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";

/**
 * Shows a success toast once `show` is true, for outcomes a page learns from
 * its URL (redirects, email links). Then runs `onShown`, which usually
 * removes the search param so a reload does not show it again.
 */
export function useToastOnce(
	show: boolean,
	message: { title: string; description?: string },
	onShown?: () => void,
) {
	const shown = useRef(false);
	const { title, description } = message;

	useEffect(() => {
		if (!show || shown.current) {
			return;
		}
		shown.current = true;
		toast.add({ type: "success", title, description });
		onShown?.();
	}, [show, title, description, onShown]);
}
