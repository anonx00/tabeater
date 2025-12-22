module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/extension/src/setupTests.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/extension/src/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    }
};
