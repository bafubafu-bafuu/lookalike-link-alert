import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/shared/settings.ts', 'src/shared/navigation.ts', 'src/shared/suggestions.ts', 'src/background/state.ts', 'src/background/rules.ts'],
      thresholds: { branches: 95 },
    },
  },
});
