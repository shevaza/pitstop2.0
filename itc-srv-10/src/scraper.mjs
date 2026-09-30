import { chromium } from 'playwright';

export function scraperConfig(env = process.env) {
  if (!env.PITSTOP_URL || !env.PITSTOP_USER || !env.PITSTOP_PASS) return null;
  const url = new URL(env.PITSTOP_URL);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid PITSTOP_URL');
  return { url: env.PITSTOP_URL.replace(/\/$/, ''), user: env.PITSTOP_USER, password: env.PITSTOP_PASS };
}

async function login(page, config) {
    await page.goto(config.url, { waitUntil: "networkidle" });

    await page.fill('input[name="txtUsername"]', config.user);
    await page.fill('input[name="txtPassword"]', config.password);
    await page.click('input[type="submit"]');

    await page.locator('input[name="txtPassword"]').waitFor({ state: 'hidden', timeout: 30000 });
    await page.waitForLoadState("networkidle");
}

async function selectOptionAndWait(page, selector, value, options = {}) {
    const { timeout = 90000, watchSelectors = [] } = options;

    await page.waitForSelector(selector);
    const expectedValue = String(value);
    const optionExists = await page.$eval(
        selector,
        (select, expectedValue) =>
            Array.from(select.options).some(option => option.value === expectedValue),
        expectedValue
    );

    if (!optionExists) {
        throw new Error(`Option value "${expectedValue}" was not found for ${selector}`);
    }

    await Promise.all(
        watchSelectors.map(watchSelector => page.waitForSelector(watchSelector))
    );

    if (await page.inputValue(selector) === expectedValue) {
        return page.$eval(selector, select => ({ value: select.value, text: select.selectedOptions[0]?.innerText.trim() || "" }));
    }
    const previousBodyText = await page.locator("body").innerText();
    const previousWatchedTexts = await page.evaluate(
        watchSelectors =>
            watchSelectors.map(watchSelector => {
                const element = document.querySelector(watchSelector);
                return element ? element.innerText : null;
            }),
        watchSelectors
    );

    const selectedValues = await page.selectOption(selector, { value: expectedValue });
    if (!selectedValues.includes(expectedValue)) {
        throw new Error(`Could not select option value "${expectedValue}" for ${selector}`);
    }

    await page.waitForLoadState("networkidle", { timeout }).catch(() => null);

    if (watchSelectors.length > 0) {
        await page.waitForFunction(
            ({ expectedValue, previousWatchedTexts, selector, watchSelectors }) => {
                const select = document.querySelector(selector);
                if (!select || select.value !== expectedValue) {
                    return false;
                }

                return watchSelectors.some((watchSelector, index) => {
                    const element = document.querySelector(watchSelector);
                    return element && element.innerText !== previousWatchedTexts[index];
                });
            },
            { expectedValue, previousWatchedTexts, selector, watchSelectors },
            { timeout }
        );
    } else {
        await page
            .waitForFunction(
                previousText => document.body.innerText !== previousText,
                previousBodyText,
                { timeout: 10000 }
            )
            .catch(() => null);
    }

    await page.waitForLoadState("networkidle", { timeout }).catch(() => null);

    await page.waitForSelector(selector);

    const selectedOption = await page.$eval(
        selector,
        (select, expectedValue) => {
            const option = Array.from(select.options).find(
                option => option.value === expectedValue
            );

            return {
                value: select.value,
                text: option ? option.innerText.trim() : "",
            };
        },
        expectedValue
    );

    if (selectedOption.value !== expectedValue) {
        throw new Error(
            `Selected value mismatch for ${selector}: expected "${expectedValue}", got "${selectedOption.value}"`
        );
    }

    return selectedOption;
}

async function extractTable(page, selector, firstColumnHeader) {
    await page.waitForSelector(selector);

    return page.$eval(selector, (table, firstColumnHeader) => {
        const headerRow = Array.from(table.querySelectorAll("tr")).find(
            tr => tr.querySelectorAll("th").length > 0
        );
        const headers = headerRow
            ? Array.from(headerRow.querySelectorAll("th")).map(th =>
                th.innerText.trim()
            )
            : [];

        const rows = Array.from(table.querySelectorAll("tbody tr"))
            .map(tr =>
                Array.from(tr.querySelectorAll("td")).map(td =>
                    td.innerText.trim()
                )
            )
            .filter(row => row.length > 0);

        if (firstColumnHeader) {
            if (headers[0] === "") {
                headers[0] = firstColumnHeader;
            } else if (rows[0] && headers.length === rows[0].length - 1) {
                headers.unshift(firstColumnHeader);
            }
        }

        if (headers.length === 0) {
            return rows;
        }

        return rows.map(row =>
            Object.fromEntries(
                row.map((value, index) => [
                    headers[index] || `column${index + 1}`,
                    value,
                ])
            )
        );
    }, firstColumnHeader);
}


export function createScraper(config, launch = () => chromium.launch({ headless: true, timeout: 30000 })) {
  const browsers = new Set();
  return {
    configured: Boolean(config),
    async close() { await Promise.allSettled([...browsers].map(browser => browser.close())); },
    async execute(kind, params, signal) {
      if (!config) throw new Error('Scraper not configured');
      signal.throwIfAborted();
      const browser = await launch();
      browsers.add(browser);
      const abort = () => { void browser.close().catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);
        const { year, employeeId } = params;
    if (kind === 'pitstop-data') {
        await login(page, config);

        // Go to the page that contains the data/table
        await page.goto(`${config.url}/Users/List`, {
            waitUntil: "networkidle",
        });

        const tableSelector = "table";
        const nextSelector = 'li[id="MainContent_gvStaff_next"]';
        const rows = [];
        const maxPages = 1000;

        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
            await page.waitForSelector(`${tableSelector} tbody tr`);

            const pageRows = await page.$$eval(`${tableSelector} tbody tr`, trs =>
                trs
                    .map(tr =>
                        Array.from(tr.querySelectorAll("td")).map(td =>
                            td.innerText.trim()
                        )
                    )
                    // Ignore header/pager rows that do not contain table cells.
                    .filter(row => row.length > 0)
            );

            rows.push(...pageRows);

            const nextItem = page.locator(nextSelector);
            if ((await nextItem.count()) === 0 || !(await nextItem.isVisible())) {
                break;
            }

            const isDisabled = await nextItem.evaluate(element =>
                element.classList.contains("disabled") ||
                element.getAttribute("aria-disabled") === "true"
            );
            const nextLink = nextItem.locator("a");

            // GridView pagers commonly remove the link or disable the <li>
            // when the final page is reached.
            if (isDisabled || (await nextLink.count()) === 0) {
                break;
            }

            const previousTableText = await page
                .locator(tableSelector)
                .innerText();

            await nextLink.click();

            await page.waitForFunction(
                ({ selector, previousText }) => {
                    const table = document.querySelector(selector);
                    return table && table.innerText !== previousText;
                },
                {
                    selector: tableSelector,
                    previousText: previousTableText,
                }
            );

            if (pageNumber === maxPages) {
                throw new Error(`Pagination exceeded ${maxPages} pages`);
            }
        }
        
        return {
            success: true,
            rows,
        };
    }
    if (kind === 'employee-leaves') {
        await login(page, config);

        await page.goto(`${config.url}/Leaves/BalanceLogs`, {
            waitUntil: "networkidle",
        });

        const selectedYear = await selectOptionAndWait(
            page,
            'select[name="ctl00$MainContent$ddlYear"]',
            year
        );
        const selectedEmployee = await selectOptionAndWait(
            page,
            'select[name="ctl00$MainContent$ucUsersListWithFilter$ddlUsers"]',
            employeeId,
            {
                timeout: 90000,
                watchSelectors: [
                    "#MainContent_gvLogs",
                    "#MainContent_gvBalances",
                ],
            }
        );

        await page.waitForSelector("#MainContent_gvLogs");
        await page.waitForSelector("#MainContent_gvBalances");

        const [logs, balances] = await Promise.all([
            extractTable(page, "#MainContent_gvLogs", "#"),
            extractTable(page, "#MainContent_gvBalances", "Leave Type"),
        ]);

        return {
            success: true,
            year: selectedYear.value,
            employeeId: selectedEmployee.value,
            employee: selectedEmployee.text,
            logs,
            balances,
        };
    }
    if (kind === 'leave-users') {
        await login(page, config);

        await page.goto(`${config.url}/Leaves/BalanceLogs`, {
            waitUntil: "networkidle",
        });

        const selectSelector = "#MainContent_ucUsersListWithFilter_ddlUsers";
        await page.waitForSelector(selectSelector);

        const users = await page.$$eval(`${selectSelector} option`, options =>
            options.map(option => ({
                value: option.value,
                text: option.innerText.trim(),
            }))
        );

        return {
            success: true,
            users,
        };
    }

        throw new Error('Unknown scraper operation');
      } finally {
        signal.removeEventListener('abort', abort);
        await browser.close().catch(() => {});
        browsers.delete(browser);
      }
    },
  };
}
