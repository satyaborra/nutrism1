"use client";

/**
 * Authenticated SPA: routes between the sidebar views. Views share the store's
 * dataVersion so logging a meal refreshes every visible section.
 */
import { HomeView } from "./views/home-view";
import { LogView } from "./views/log-view";
import { MealsView } from "./views/meals-view";
import { InsightsView } from "./views/insights-view";
import { CoachView } from "./views/coach-view";
import { ProfileView } from "./views/profile-view";
import { GoalsView } from "./views/goals-view";
import { SettingsView } from "./views/settings-view";
import { useNutriStore } from "./store";

export function Dashboard() {
  const view = useNutriStore((s) => s.view);

  switch (view) {
    case "log":
      return <LogView />;
    case "meals":
      return <MealsView />;
    case "insights":
      return <InsightsView />;
    case "coach":
      return <CoachView />;
    case "profile":
      return <ProfileView />;
    case "goals":
      return <GoalsView />;
    case "settings":
      return <SettingsView />;
    case "home":
    default:
      return <HomeView />;
  }
}
