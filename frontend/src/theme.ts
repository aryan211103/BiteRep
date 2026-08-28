// Global theme, colors, spacing.
export const colors = {
  surface: '#F8F9FA',
  onSurface: '#111827',
  surfaceSecondary: '#FFFFFF',
  onSurfaceSecondary: '#1F2937',
  surfaceTertiary: '#F3F4F6',
  onSurfaceTertiary: '#374151',
  surfaceInverse: '#1F2937',
  onSurfaceInverse: '#FFFFFF',
  brand: '#16a34a',
  brandLight: '#dcfce7',
  brandDark: '#166534',
  brandSecondary: '#22c55e',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#4b5563',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  muted: '#6B7280',
  mutedStrong: '#4B5563',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardStrong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
};

export const macros = {
  protein: '#16a34a',
  carbs: '#eab308',
  fat: '#f97316',
};

export const mealBudgetPct: Record<string, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snacks: 0.10,
  dinner: 0.30,
};

export const mealOrder = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;
export type MealKey = typeof mealOrder[number];

export const mealLabel: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
};
