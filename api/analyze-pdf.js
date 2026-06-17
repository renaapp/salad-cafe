export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { base64Data } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'base64Data is required' });
  }

  const prompt = `この見積書・納品書PDFから食材（食品）の情報を抽出してください。
以下のJSON配列形式だけを返してください。余分なテキストは不要です。

[
  {"name": "食材名", "unitPrice": 数値(円), "buyQty": 数値, "unit": "単位"},
  ...
]

ルール:
- name: 食材・食品名のみ（消耗品・飲料・加工品は除外）
- unitPrice: 税込価格（円、整数）。税抜の場合は×1.1して整数に
- buyQty: PDFに記載の数量をそのまま（単位変換しない）
- unit: PDFに記載の単位をそのまま使う（g / kg / 個 / 本 / 枚 / ml / L / パック / 袋 など）。記載がない場合は "g"
- 情報が不明・不確かな項目はスキップ
- 食材でないものはスキップ`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(422).json({ error: 'JSON形式のデータが見つかりませんでした' });
    }

    const match = textBlock.text.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(422).json({ error: 'JSON形式のデータが見つかりませんでした' });
    }

    const items = JSON.parse(match[0]);
    return res.status(200).json(items);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
