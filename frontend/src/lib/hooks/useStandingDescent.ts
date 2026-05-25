import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "paddlemate_standing_descent";
const CHANGE_EVENT = "paddlemate_standing_change";

export interface StandingDescent {
	startTime: string; // ISO
	waterwayId: number;
	sectionId: number;
	sectionName: string;
}

function readStorage(): StandingDescent | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as StandingDescent) : null;
	} catch {
		return null;
	}
}

export function useStandingDescent() {
	const [current, setCurrent] = useState<StandingDescent | null>(readStorage);

	useEffect(() => {
		const handler = () => setCurrent(readStorage());
		window.addEventListener(CHANGE_EVENT, handler);
		return () => window.removeEventListener(CHANGE_EVENT, handler);
	}, []);

	const start = useCallback((data: StandingDescent) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
	}, []);

	const discard = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
	}, []);

	return { current, start, discard };
}
