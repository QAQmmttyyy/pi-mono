import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/button.js";
import { useTheme } from "./ThemeProvider.js";

export function ThemeToggle() {
	const { theme, toggleTheme } = useTheme();

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-8 w-8"
			onClick={toggleTheme}
		>
			{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</Button>
	);
}
