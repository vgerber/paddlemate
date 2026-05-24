import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getUserManager } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
	component: AuthCallback,
});

function AuthCallback() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const hasProcessed = useRef(false);

	useEffect(() => {
		if (hasProcessed.current) return;
		hasProcessed.current = true;

		getUserManager()
			.signinRedirectCallback()
			.then(() =>
				navigate({
					to: "/",
					search: {
						waterway: undefined,
						section: undefined,
						q: undefined,
						country: undefined,
						min_diff: undefined,
						max_diff: undefined,
						mode: undefined,
						lat: undefined,
						lon: undefined,
						radius: undefined,
					},
				}),
			)
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : "Authentication failed");
			});
	}, [navigate]);

	if (error) {
		return (
			<div style={{ padding: "2rem", textAlign: "center" }}>
				<p>Authentication error: {error}</p>
				<button
					type="button"
					onClick={() =>
						navigate({
							to: "/",
							search: {
								waterway: undefined,
								section: undefined,
								q: undefined,
								country: undefined,
								min_diff: undefined,
								max_diff: undefined,
								mode: undefined,
								lat: undefined,
								lon: undefined,
								radius: undefined,
							},
						})
					}
				>
					Go home
				</button>
			</div>
		);
	}

	return (
		<div style={{ padding: "2rem", textAlign: "center" }}>
			Completing sign-in…
		</div>
	);
}
