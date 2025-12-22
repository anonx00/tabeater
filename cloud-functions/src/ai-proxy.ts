import * as functions from '@google-cloud/functions-framework';
import Groq from 'groq-sdk';
import cors from 'cors';

const corsHandler = cors({ origin: true });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'demo_key' });

functions.http('aiProxy', (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const { action, prompt } = req.body;

        if (!action || !prompt) {
            res.status(400).send('Missing action or prompt');
            return;
        }

        try {
            console.log(`Processing ${action}...`);

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are a tactical AI assistant. Respond with JSON only.' },
                    { role: 'user', content: prompt }
                ],
                model: 'llama3-8b-8192',
                temperature: 0.1,
                response_format: { type: 'json_object' }
            });

            const result = completion.choices[0]?.message?.content || '{}';
            res.json({ result });

        } catch (error: any) {
            console.error('Groq Error:', error);
            res.status(500).json({ error: error.message });
        }
    });
});
