'use strict';
/* Clean-room typed LLM output contracts (#3841), BAML-inspired (BoundaryML/baml, Apache-2.0) without the
   runtime/CLI. Small Zod-like helpers: define a schema, extract JSON from a model reply, validate, or throw
   with a path. Used first by scripts/pagespeed/ai.js for Gemini's PageSpeed edit JSON. */

function fail(path, message) {
	const where = path || '(root)';
	const err = new Error('llm-contract at ' + where + ': ' + message);
	err.code = 'LLM_CONTRACT';
	err.path = where;
	throw err;
}

function string(opts = {}) {
	const min = opts.min != null ? opts.min : 0;
	const max = opts.max != null ? opts.max : Infinity;
	return {
		type: 'string',
		parse(value, path) {
			if (typeof value !== 'string') fail(path, 'expected string, got ' + typeof value);
			if (value.length < min) fail(path, 'string shorter than ' + min);
			if (value.length > max) fail(path, 'string longer than ' + max);
			return value;
		},
	};
}

function number(opts = {}) {
	const min = opts.min != null ? opts.min : -Infinity;
	const max = opts.max != null ? opts.max : Infinity;
	const int = !!opts.int;
	return {
		type: 'number',
		parse(value, path) {
			if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected finite number');
			if (int && !Number.isInteger(value)) fail(path, 'expected integer');
			if (value < min) fail(path, 'number below ' + min);
			if (value > max) fail(path, 'number above ' + max);
			return value;
		},
	};
}

function boolean() {
	return {
		type: 'boolean',
		parse(value, path) {
			if (typeof value !== 'boolean') fail(path, 'expected boolean');
			return value;
		},
	};
}

function literal(expected) {
	return {
		type: 'literal',
		parse(value, path) {
			if (value !== expected) fail(path, 'expected ' + JSON.stringify(expected));
			return value;
		},
	};
}

function optional(inner) {
	return {
		type: 'optional',
		parse(value, path) {
			if (value === undefined || value === null) return undefined;
			return inner.parse(value, path);
		},
	};
}

function array(inner, opts = {}) {
	const min = opts.min != null ? opts.min : 0;
	const max = opts.max != null ? opts.max : Infinity;
	return {
		type: 'array',
		parse(value, path) {
			if (!Array.isArray(value)) fail(path, 'expected array');
			if (value.length < min) fail(path, 'array shorter than ' + min);
			if (value.length > max) fail(path, 'array longer than ' + max);
			return value.map((item, i) => inner.parse(item, path + '[' + i + ']'));
		},
	};
}

function object(shape, opts = {}) {
	const strict = opts.strict !== false;
	return {
		type: 'object',
		parse(value, path) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
			const out = {};
			for (const key of Object.keys(shape)) {
				const child = path ? path + '.' + key : key;
				if (!(key in value)) {
					if (shape[key].type === 'optional') continue;
					fail(child, 'missing');
				}
				const parsed = shape[key].parse(value[key], child);
				if (parsed !== undefined) out[key] = parsed;
			}
			if (strict) {
				for (const key of Object.keys(value)) {
					if (!(key in shape)) fail(path ? path + '.' + key : key, 'unknown key');
				}
			}
			return out;
		},
	};
}

const s = { string, number, boolean, literal, optional, array, object };

/** Strip ``` fences and take the outermost JSON value (object or array). */
function extractJson(text) {
	const body = String(text || '')
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```\s*$/, '')
		.trim();
	const objStart = body.indexOf('{');
	const arrStart = body.indexOf('[');
	let start = -1;
	let end = -1;
	if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
		start = objStart;
		end = body.lastIndexOf('}');
	} else if (arrStart >= 0) {
		start = arrStart;
		end = body.lastIndexOf(']');
	}
	if (start < 0 || end <= start) throw new Error('llm-contract: no JSON object or array in model reply');
	return JSON.parse(body.slice(start, end + 1));
}

function validate(schema, value) {
	return schema.parse(value, '');
}

function parseJson(text, schema) {
	const raw = extractJson(text);
	return schema ? validate(schema, raw) : raw;
}

/** PageSpeed Gemini edit payload (scripts/pagespeed/ai.js). */
const pageSpeedEdits = object({
	summary: optional(string({ max: 500 })),
	edits: array(
		object({
			file: string({ min: 1, max: 260 }),
			find: string({ min: 1 }),
			replace: string(),
			why: optional(string({ max: 160 })),
		}),
		{ max: 6 }
	),
});

module.exports = {
	s,
	extractJson,
	validate,
	parseJson,
	pageSpeedEdits,
};
