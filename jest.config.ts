import { Config } from 'jest';

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        resolveJsonModule: true,
      },
    }],
  },
} as Config;
