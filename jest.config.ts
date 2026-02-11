import { Config } from 'jest';

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/helpers/', '/__tests__/__fixtures__/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        resolveJsonModule: true,
      },
    }],
  },
} as Config;
