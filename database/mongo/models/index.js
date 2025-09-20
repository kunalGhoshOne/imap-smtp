const fs = require('fs');
const path = require('path');
const EmailBodyStorage = require('../EmailBodyStorage');

function loadModels(dir) {
    const models = {};

    if (!fs.existsSync(dir)) {
        return models;
    }

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recursively load models from subdirectories
            models[file] = loadModels(filePath);
        } else if (file.endsWith('.js') && file !== 'index.js') {
            // Load individual model files
            const modelName = path.basename(file, '.js');
            models[modelName] = require(filePath);
        }
    });
    models['EmailBodyStorage']=EmailBodyStorage;
    return models;
}

// Auto-discover and export all models in this directory
module.exports = loadModels(__dirname);