/* Direct OpenAI-compatible requests. Credentials never enter the RedPen server. */
window.RedPenAI = (() => {
  const providers = {
    OpenAI: ['https://api.openai.com/v1', 'o3'],
    DeepSeek: ['https://api.deepseek.com/v1', 'deepseek-reasoner'],
    Qwen: ['https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen-plus'],
    OpenRouter: ['https://openrouter.ai/api/v1', 'deepseek/deepseek-r1'],
    Custom: ['', '']
  };
  function settings() { try { return JSON.parse(localStorage.getItem('redpen:ai') || '{}'); } catch (_) { return {}; } }
  function save(value) {
    if (value.base && !/^https:\/\//.test(value.base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(value.base)) throw Error('Use an HTTPS API endpoint.');
    localStorage.setItem('redpen:ai', JSON.stringify(value));
  }
  async function request(task, protocol, json = true) {
    const config = settings();
    if (!config.key || !config.base || !config.model) throw Error('Configure AI model settings / 请先设置 AI 模型。');
    let response;
    try {
      response = await fetch(config.base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(240000),
        headers: {'Content-Type':'application/json', Authorization:'Bearer ' + config.key},
        body: JSON.stringify({model:config.model, messages:[{role:'system',content:protocol},{role:'user',content:task}]})
      });
    } catch (_) { throw Error('Provider unreachable or browser CORS blocked. Try another endpoint or the local server. / 网络或跨域限制，请换接口或使用本地服务。'); }
    if (!response.ok) throw Error('AI provider HTTP ' + response.status + ' · check key, model and quota / 检查密钥、模型和额度');
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw Error('Model returned no answer / 模型未返回答案');
    if (!json) return content;
    return JSON.parse(content.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
  }
  function validate(d, level) {
    if (!d || !['title','problem','final_answer'].every(k => typeof d[k] === 'string') || !Array.isArray(d.steps) || d.steps.length < 3 || d.steps.length > 30 || !d.steps.every(s => typeof s === 'string' && s.trim())) throw Error('Invalid worksheet');
    const k = d.key;
    if (!k || k.level !== level || !Array.isArray(k.clean_steps) || !k.clean_steps.length || !k.clean_steps.every(s => typeof s === 'string') || typeof k.clean_final_answer !== 'string' || !Array.isArray(k.errors)) throw Error('Invalid answer key');
    const n = k.errors.length, bounds = [[0,0],[1,1],[2,3],[Math.max(3,Math.ceil(.4*d.steps.length)),d.steps.length],[Math.ceil(.7*d.steps.length),d.steps.length]][level];
    if (n < bounds[0] || n > bounds[1]) throw Error('Wrong number of planted errors');
    const seen = new Set();
    for (const e of k.errors) {
      if (!Number.isInteger(e.step) || e.step < 1 || e.step > d.steps.length || seen.has(e.step)) throw Error('Invalid error step');
      seen.add(e.step);
      if (!['category','original','corrupted','why_wrong','why_tempting','catch_rule','hint'].every(f => typeof e[f] === 'string') || !e.practice || typeof e.practice.problem !== 'string' || typeof e.practice.answer !== 'string' || e.corrupted !== d.steps[e.step-1] || e.original === e.corrupted) throw Error('Invalid error details');
    }
    k.errors.sort((a,b) => a.step-b.step);
    return d;
  }
  function validateGrade(g, n) {
    if (!g || !Array.isArray(g.errors) || g.errors.length !== n || !Array.isArray(g.false_alarms) || !Array.isArray(g.bounties) || typeof g.feedback !== 'string') throw Error('Invalid model grade');
    for (const e of g.errors) {
      if (typeof e.found !== 'boolean' || ![0,.5,1].includes(e.diagnosis) || ![0,.5,1].includes(e.fix)) throw Error('Invalid grade row');
      if (!e.found) e.diagnosis = e.fix = 0;
    }
    return g;
  }
  async function hash(key) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RedPenGrade.canonicalize(key)));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  return {providers,settings,save,request,validate,validateGrade,hash};
})();
