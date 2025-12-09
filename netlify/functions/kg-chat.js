
/**
 * Knowledge Graph Chatbot API using Gemini
 * POST /.netlify/functions/kg-chat
 * Body: { 
 *   "messages": [{ "role": "user", "content": "..." }],
 *   "context": { "searchResults": [...] }
 * }
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const messages = body.messages || [];
        const searchContext = body.context || {};

        // Validate configuration
        const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('Missing Gemini API Key');
        }

        // Construct the System Prompt
        let moviesContext = "";
        if (searchContext.searchResults && searchContext.searchResults.length > 0) {
            const topMovies = searchContext.searchResults.slice(0, 5); // Just top 5 to save tokens
            moviesContext = "Current Search Results shown to user:\n" +
                topMovies.map((m, i) => `${i + 1}. ${m.title} (${m.year}): ${m.overview}`).join("\n");
        } else {
            moviesContext = "No movies are currently currently shown.";
        }

        const systemInstruction = `You are a helpful Movie Assistant integrated into a Knowledge Graph semantic search engine.
    
${moviesContext}

Your Goal: Help the user explore these movies or find new ones.
1. If the user asks "Why did I get this?", explain the connection between their query and the movie's themes/plot (referenced in the results).
2. If the user wants to refine their search (e.g. "something happier", "older movies"), suggest what they should type in the search bar, or just give recommendations from your general knowledge.
3. Be concise, friendly, and conversational.
4. If asked about technical details, these results come from a Pinecone Vector Database using 768-dimensional Vertex AI embeddings.`;

        // Format history for Gemini (checking for 'user' vs 'model' roles)
        // Gemini API expects: { role: 'user'|'model', parts: [{ text: '...' }] }
        const contents = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Add system instruction effectively by prepending it to the first user message or just rely on the model's context window
        // Gemini 1.5 allows system_instruction, but for simple REST call we can prepend to history or use 'system' if supported. 
        // Standard approach: Prepend context to the latest prompt or first prompt.
        // Let's prepend to the very first message for context setting.
        if (contents.length > 0) {
            contents[0].parts[0].text = systemInstruction + "\n\nUser: " + contents[0].parts[0].text;
        } else {
            // Should not happen if messages array is valid
            contents.push({ role: 'user', parts: [{ text: systemInstruction }] });
        }

        // Call Gemini API
        const model = 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ reply }),
        };

    } catch (error) {
        console.error('Chat error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Chat failed', details: error.message }),
        };
    }
};
