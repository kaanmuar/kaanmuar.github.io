'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { s, extractJson, parseJson, validate, pageSpeedEdits } = require('../../scripts/llm-contract');
const ai = require('../../scripts/pagespeed/ai');

test('extractJson strips fences and keeps the outermost object', () => {
	assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
	assert.deepEqual(extractJson('here\n[{"x":true}]\n'), [{ x: true }]);
	assert.throws(() => extractJson('no json'), /no JSON/);
});

test('s.object / optional / array validate with paths', () => {
	const schema = s.object({
		name: s.string({ min: 1 }),
		n: s.optional(s.number({ int: true, min: 0 })),
		tags: s.array(s.string(), { max: 2 }),
	});
	assert.deepEqual(validate(schema, { name: 'ok', tags: ['a'] }), { name: 'ok', tags: ['a'] });
	assert.throws(() => validate(schema, { tags: [] }), /name: missing/);
	assert.throws(() => validate(schema, { name: 'ok', tags: ['a', 'b', 'c'] }), /tags: array longer than 2/);
	assert.throws(() => validate(schema, { name: 'ok', tags: [], extra: 1 }), /extra: unknown key/);
});

test('pageSpeedEdits contract accepts empty edits and a full edit row', () => {
	assert.deepEqual(parseJson('{"edits":[]}', pageSpeedEdits), { edits: [] });
	const full = parseJson(
		'{"summary":"trim CSS","edits":[{"file":"a.css","find":"x","replace":"y","why":"smaller"}]}',
		pageSpeedEdits
	);
	assert.equal(full.summary, 'trim CSS');
	assert.equal(full.edits[0].file, 'a.css');
	assert.throws(() => parseJson('{"edits":[{"file":"","find":"x","replace":""}]}', pageSpeedEdits), /file/);
	assert.throws(
		() =>
			parseJson(
				'{"edits":[' +
					Array.from({ length: 7 }, () => '{"file":"a","find":"x","replace":""}').join(',') +
					']}',
				pageSpeedEdits
			),
		/longer than 6/
	);
});

test('pagespeed ai.parse uses the PageSpeed edits contract', () => {
	assert.deepEqual(ai.parse('```json\n{"edits":[]}\n```'), { edits: [] });
	const out = ai.parse(
		'noise {"summary":"ok","edits":[{"file":"index.html","find":"<p>a</p>","replace":"<p>b</p>","why":"copy"}]} trailing'
	);
	assert.equal(out.edits[0].replace, '<p>b</p>');
	assert.throws(() => ai.parse('{"edits":"nope"}'), /LLM_CONTRACT|expected array/);
	assert.throws(() => ai.parse('not json'), /did not answer in JSON/);
});
