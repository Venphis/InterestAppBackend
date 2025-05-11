// jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['./jest.setup.js'], // Poprawna ścieżka
    // Opcje, które dodałeś są dobre:
    // testTimeout: 10000, // Już w package.json
    // runInBand: true,    // Już w package.json
    // detectOpenHandles: true, // Dobre do debugowania
    // forceExit: true,         // Używaj ostrożnie, może maskować problemy
};