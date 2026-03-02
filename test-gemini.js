require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testAPI() {
    console.log('Testing Gemini API...');
    console.log('API Key:', process.env.GEMINI_API_KEY ? 'Found' : 'NOT FOUND');

    try {
        // List available models
        console.log('\nListing available models...');
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash-exp', 'gemini-1.5-flash-latest'];

        for (const modelName of models) {
            try {
                console.log(`\nTrying ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Say hello in 3 words');
                console.log(`✅ ${modelName} WORKS:`, result.response.text());
                break; // Stop after first success
            } catch (e) {
                console.log(`❌ ${modelName} failed:`, e.message.substring(0, 100));
            }
        }
    } catch (e) {
        console.error('❌ FAILED:', e.message);
    }
}

testAPI();

