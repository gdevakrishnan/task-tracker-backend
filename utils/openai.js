// utils/openai.js
const OpenAI = require('openai');

// Configure for DeepSeek API
// Security: API key must be provided via environment variable
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required. Please set it in your .env file.');
}

const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1'
});

// Enterprise-scale constants
const MAX_QUESTIONS_PER_BATCH = 30;
const MAX_TOKENS = 4096;
const BATCH_DELAY = 500;
const API_RETRY_DELAY = 2000;
const MAX_API_RETRIES = 3;

class RateLimiter {
    constructor(requestsPerMinute = 20) {
        this.requests = [];
        this.maxRequests = requestsPerMinute;
    }

    async waitIfNeeded() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < 60000);
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = 60000 - (now - oldestRequest) + 100;
            if (waitTime > 0) {
                console.log(`[DeepSeek] Waiting ${waitTime}ms to respect rate limits...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        this.requests.push(now);
    }
}

const rateLimiter = new RateLimiter(20);

const generateSingleBatch = async (topics, numQuestionsPerTopic, difficulty = 'Medium', attempt = 1) => {
    await rateLimiter.waitIfNeeded();

    const selectedDifficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium';

    const prompt = `Generate exactly ${numQuestionsPerTopic} unique, high-quality multiple-choice questions for the topic: "${topics[0]}".

    CRITICAL REQUIREMENTS:
    1.  **Your entire response must be a single, valid JSON object, starting with { and ending with }. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.**
    2.  Each topic must have exactly ${numQuestionsPerTopic} questions.
    3.  Each question needs: "questionText", "options" (an array of exactly 4 string choices), and "correctAnswer" (the exact text of the correct option).
    4.  The position of the correct answer within the "options" array MUST be randomized.
    5.  All questions should be of "${selectedDifficulty}" difficulty.
    
    Response format:
    {
        "${topics[0]}": [
            {
                "questionText": "Question text here?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": "Option C" 
            }
        ]
    }`;

    let rawResponse = '';
    try {
        console.log(`[DeepSeek] API Call ${attempt} - Generating ${numQuestionsPerTopic} questions for:`, topics);
        
        const response = await openai.chat.completions.create({
            model: "deepseek-chat", // Changed from gpt-3.5-turbo to deepseek-chat
            messages: [
                { 
                    role: "system", 
                    content: "You are a professional question generator. You will only respond with a valid, complete JSON object based on the user's request."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
        });

        rawResponse = response.choices[0].message.content.trim();
        
        // --- FIXED & IMPROVED JSON PARSING ---
        let jsonString = rawResponse;
        const startIndex = jsonString.indexOf('{');
        const endIndex = jsonString.lastIndexOf('}');

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = jsonString.substring(startIndex, endIndex + 1);
        } else {
             throw new Error("No valid JSON object found in the AI response.");
        }

        const parsedQuestions = JSON.parse(jsonString);
        
        for (const topic of topics) {
            if (!parsedQuestions[topic] || !Array.isArray(parsedQuestions[topic])) {
                throw new Error(`Invalid response structure for topic: ${topic}`);
            }
            for (const question of parsedQuestions[topic]) {
                if (!question.questionText || !Array.isArray(question.options) || question.options.length !== 4 || !question.correctAnswer) {
                    throw new Error(`Invalid question structure in topic: ${topic}`);
                }
                if (!question.options.includes(question.correctAnswer)) {
                    throw new Error(`Correct answer not found in options for topic: ${topic}`);
                }
            }
        }
        
        console.log(`[DeepSeek] ✅ Successfully generated questions for:`, topics);
        return parsedQuestions;

    } catch (error) {
        console.error(`[DeepSeek] ❌ Batch generation failed (attempt ${attempt}):`, error.message);
        console.error("[DeepSeek] Raw problematic response:", rawResponse);
        throw error;
    }
};

const generateMCQQuestions = async (topics, numQuestionsPerTopic, difficulty = 'Medium') => {
    try {
        console.log(`\n[DeepSeek] 🚀 ENTERPRISE GENERATION STARTED`);
        console.log(`[DeepSeek] Topics: ${topics.length}, Questions per topic: ${numQuestionsPerTopic}`);
        
        const startTime = Date.now();
        const results = {};
        topics.forEach(topic => results[topic] = []);

        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
            const topic = topics[topicIndex];
            console.log(`\n[DeepSeek] 📋 Processing topic ${topicIndex + 1}/${topics.length}: "${topic}"`);
            
            let remaining = numQuestionsPerTopic;
            let batchNumber = 1;
            
            while (remaining > 0) {
                const batchSize = Math.min(remaining, MAX_QUESTIONS_PER_BATCH);
                console.log(`[DeepSeek] 🔄 Batch ${batchNumber} for "${topic}": ${batchSize} questions (${remaining} remaining)`);
                
                let batchSuccess = false;
                let batchAttempt = 1;
                
                while (!batchSuccess && batchAttempt <= MAX_API_RETRIES) {
                    try {
                        const batchResult = await generateSingleBatch([topic], batchSize, difficulty, batchAttempt);
                        
                        if (batchResult[topic] && Array.isArray(batchResult[topic]) && batchResult[topic].length > 0) {
                            const generatedCount = Math.min(batchResult[topic].length, batchSize);
                            results[topic].push(...batchResult[topic].slice(0, generatedCount));
                            
                            console.log(`[DeepSeek] ✅ Batch ${batchNumber} success: ${generatedCount} questions generated`);
                            remaining -= generatedCount;
                            batchSuccess = true;
                        } else {
                            throw new Error("Empty or invalid batch result");
                        }
                    } catch (batchError) {
                        console.error(`[DeepSeek] ⚠️ Batch ${batchNumber} attempt ${batchAttempt} failed:`, batchError.message);
                        
                        if (batchAttempt < MAX_API_RETRIES) {
                            const retryDelay = API_RETRY_DELAY * batchAttempt;
                            console.log(`[DeepSeek] ⏳ Retrying in ${retryDelay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        } else {
                            console.error(`[DeepSeek] ❌ Batch ${batchNumber} failed after ${MAX_API_RETRIES} attempts, skipping...`);
                            remaining = 0;
                        }
                        batchAttempt++;
                    }
                }
                batchNumber++;
                
                if (remaining > 0 && batchSuccess) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            console.log(`[DeepSeek] 📊 Topic "${topic}" completed: ${results[topic].length}/${numQuestionsPerTopic} questions`);
            
            if (topicIndex < topics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log(`\n[DeepSeek] 🎉 ENTERPRISE GENERATION COMPLETED`);
        console.log(`[DeepSeek] ⏱️ Duration: ${duration} seconds`);
        
        return results;

    } catch (error) {
        console.error("[DeepSeek] 💥 ENTERPRISE GENERATION FAILED:", error.message);
        throw new Error(`Enterprise generation failed: ${error.message}`);
    }
};

module.exports = { generateMCQQuestions };