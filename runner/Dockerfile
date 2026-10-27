# The Playwright tag must match @playwright/test in runner/package.json, or the browsers in the image will not be found.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY runner/package.json runner/
WORKDIR /app/runner
RUN npm install --omit=dev --no-audit --no-fund
WORKDIR /app
COPY js/qa-review-scripts.js js/
COPY runner/cube.js runner/run.js runner/
ENV NODE_ENV=production CUBE_WORKERS=2
USER pwuser
CMD ["node", "runner/run.js"]
