import { config } from '@/config';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';

const rootUrl = 'https://idcflare.com';

/**
 * Discourse API 请求
 * 该站与 linux.do 为同一团队维护，使用 Zstandard 压缩，
 * 需要设置 Accept-Encoding: identity 避免压缩导致的解析问题
 */
function createFetch(path: string) {
    return ofetch(new URL(path, rootUrl).href, {
        headers: {
            'Accept-Encoding': 'identity',
            'User-Agent': config.trueUA,
        },
    });
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
    const { categories } = await cache.tryGet('idcflare:categories', () => createFetch('/site.json'), config.cache.routeExpire, false);
    return new Map((categories as Category[]).map((c) => [c.id, c.name]));
}

export { rootUrl, createFetch, getCategoryMap };