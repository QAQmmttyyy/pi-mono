import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
	return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem("pi-theme");
		if (stored === "light" || stored === "dark") return stored;
		return document.documentElement.classList.contains("dark") ? "dark" : "light";
	});

	// Write theme to DOM + localStorage
	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
		localStorage.setItem("pi-theme", theme);
	}, [theme]);

	// Sync with external class changes (Storybook toolbar)
	useEffect(() => {
		const sync = () => {
			const isDark = document.documentElement.classList.contains("dark");
			setThemeState((prev) => {
				const next = isDark ? "dark" : "light";
				return prev !== next ? next : prev;
			});
		};
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	const setTheme = (t: Theme) => setThemeState(t);
	const toggleTheme = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}
