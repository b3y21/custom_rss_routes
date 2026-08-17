import { config } from '@/config';
import cache from '@/utils/cache';
import { getPlaywrightPage } from '@/utils/playwright';

const rootUrl = 'https://idcflare.com';

/**
 * 使用 Playwright 在浏览器上下文中请求 Discourse JSON API。
 * 该站由 Cloudflare 保护，直接 HTTP 请求 API 会返回 403，
 * 通过真实浏览器加载站点后可携带 Cloudflare 校验凭据通过请求。
 */
async function fetchJson(path: string) {
    const apiUrl = new URL(path, rootUrl).href;
    const { page, destroy } = await getPlaywrightPage(rootUrl, {
        gotoConfig: { waitUntil: 'domcontentloaded' },
    });

    try {
        // 等待 Discourse 主体渲染完成，确保 Cloudflare 校验已通过
        try {
            await page.waitForSelector('#main-outlet', { timeout: 15000 });
        } catch {
            // 页面未渲染完成时仍尝试请求，失败交由下方错误处理
        }

        const data = await page.evaluate(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return await response.json();
        }, apiUrl);

        return data;
    } finally {
        await destroy();
    }
}

type Category = {
    id: number;
    name: string;
    slug?: string;
};

/**
 * 获取分类 ID 到名称的映射（来自 site.json）
 */
async function getCategoryMap(): Promise<Map<number, string>> {
    const data = await cache.tryGet('idcflare:categories', () => fetchJson('/site.json'), config.cache.routeExpire, false);
    const categories = (data as { categories: Category[] }).categories;
    return new Map(categories.map((c) => [c.id, c.name]));
}

export { rootUrl, fetchJson, getCategoryMap };
