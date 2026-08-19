import { config } from '@/config';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
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

// Fetch multiple API paths in a single browser session to avoid one Playwright page per request
async function fetchJsonBatch(paths: string[]) {
    const apiUrls = paths.map((path) => new URL(path, rootUrl).href);
    const { page, destroy } = await getPlaywrightPage(rootUrl, {
        gotoConfig: { waitUntil: 'domcontentloaded' },
    });

    try {
        // Wait for the Discourse main outlet to render, ensuring Cloudflare validation passed
        try {
            await page.waitForSelector('#main-outlet', { timeout: 15000 });
        } catch {
            // Page not fully rendered, still attempt the requests; errors are handled below
        }

        return await page.evaluate(
            (urls) =>
                Promise.all(
                    urls.map(async (url) => {
                        const response = await fetch(url);
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status} ${response.statusText}`);
                        }
                        return await response.json();
                    })
                ),
            apiUrls
        );
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
 * Get the category ID to name mapping (from site.json)
 */
async function getCategoryMap(): Promise<Map<number, string>> {
    const data = await cache.tryGet('idcflare:categories', () => fetchJson('/site.json'), config.cache.routeExpire, false);
    const categories = (data as { categories: Category[] }).categories;
    return new Map(categories.map((c) => [c.id, c.name]));
}

type Post = {
    username: string;
    display_username?: string;
    post_number: number;
    cooked: string;
};

type Topic = {
    id: number;
    title: string;
    bumped_at: string;
    category_id: number;
    tags?: Array<{ name: string }>;
};

// Uncached topics are fetched in a single browser session and cached individually
async function getTopicPosts(topicIds: number[]): Promise<Map<number, Post[]>> {
    const postsMap = new Map<number, Post[]>();
    const uncachedIds: number[] = [];

    const cachedResults = await Promise.all(topicIds.map((topicId) => cache.get(`idcflare:topic:${topicId}`)));
    for (const [index, topicId] of topicIds.entries()) {
        const cached = cachedResults[index];
        if (cached) {
            postsMap.set(topicId, JSON.parse(cached));
        } else {
            uncachedIds.push(topicId);
        }
    }

    if (uncachedIds.length > 0) {
        const topicData = (await fetchJsonBatch(uncachedIds.map((id) => `/t/${id}.json`))) as Array<{ post_stream: { posts: Post[] } }>;
        await Promise.all(
            uncachedIds.map(async (topicId, index) => {
                const posts = topicData[index].post_stream.posts;
                postsMap.set(topicId, posts);
                await cache.set(`idcflare:topic:${topicId}`, JSON.stringify(posts));
            })
        );
    }

    return postsMap;
}

async function getTopicItems(topics: Topic[], categoryMap: Map<number, string>) {
    const postsMap = await getTopicPosts(topics.map((topic) => topic.id));

    return topics.map((topic) => {
        const posts = postsMap.get(topic.id) ?? [];
        const firstPost = posts[0];
        const category = categoryMap.get(topic.category_id);

        return {
            title: topic.title,
            link: `${rootUrl}/t/topic/${topic.id}`,
            pubDate: parseDate(topic.bumped_at),
            author: firstPost ? firstPost.display_username || firstPost.username : undefined,
            category: [...(category ? [category] : []), ...(topic.tags ? topic.tags.map((tag) => tag.name) : [])],
            description: posts.map((post) => `<p><strong>${post.display_username || post.username}</strong> #${post.post_number}</p>${post.cooked}`).join('<hr>'),
        };
    });
}

export { fetchJson, getCategoryMap, getTopicItems, rootUrl };
