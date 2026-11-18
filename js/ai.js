// FLIPNOTE Optional AI Provider Interface
// Disabled by default. Core features NEVER depend on this module.
// No hardcoded keys, no automatic paid requests.

export async function generateWithOptionalAI({ settings, task, text, count = 8, targetLanguage = 'en' }) {
  if (!settings || !settings.aiEnabled || !settings.aiApiKey) {
    return null;
  }

  const provider = settings.aiProvider || 'openai-compatible';
  const apiKey = settings.aiApiKey.trim();
  const model = (settings.aiModel || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini')).trim();

  const systemPrompt = task === 'flashcards'
    ? `Create ${count} concise study flashcards in language "${targetLanguage}" from the notes. Return ONLY valid JSON array: [{"front":"...","back":"..."}].`
    : `Create ${count} multiple-choice questions in language "${targetLanguage}" from the notes. Return ONLY valid JSON array: [{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}].`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nNotes:\n${text.slice(0, 12000)}` }] }]
      })
    });
    if (!res.ok) throw new Error(`Gemini API error (${res.status})`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return extractJsonArray(raw);
  }

  // OpenAI-compatible endpoint
  const endpoint = (settings.aiEndpoint || 'https://api.openai.com/v1/chat/completions').trim();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 12000) }
      ]
    })
  });
  if (!res.ok) throw new Error(`AI API error (${res.status})`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  return extractJsonArray(raw);
}

function extractJsonArray(raw) {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI response did not contain valid JSON');
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('Empty AI result');
  return parsed;
}
