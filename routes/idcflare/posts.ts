import type { Data, Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { fetchJson, getCategoryMap, rootUrl } from './utils';

export const route: Route = {
    path: '/posts',
    categories: ['bbs'],
    example: '/idcflare/posts',
    name: '最新帖子',
    maintainers: [],
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
    },
    handler,
};

async function handler(ctx): Promise<Data> {
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 50;

    const { latest_posts } = await fetchJson('/posts.json');
    const categoryMap = await getCategoryMap();

    const items = latest_posts.slice(0, limit).map((post) => {
        // 楼中楼回复：reply_to_post_number 指向被回复的楼层
        const isReply = post.reply_to_post_number != null;
        const replyTarget = isReply ? `回复 #${post.reply_to_post_number} @${post.reply_to_user}` : '';

        return {
            title: `${post.topic_title} #${post.post_number}${replyTarget ? ` (${replyTarget})` : ''}`,
            link: `${rootUrl}${post.post_url}`,
            pubDate: parseDate(post.created_at),
            author: post.display_username || post.username,
            category: categoryMap.get(post.category_id) ? [categoryMap.get(post.category_id)] : [],
            // cooked 为 Discourse 渲染后的 HTML，楼中楼引用以 <aside class="quote"> 形式包含其中
            description: post.cooked,
        };
    });

    return {
        title: 'IDC Flare - 最新帖子',
        link: `${rootUrl}/posts`,
        item: items,
        language: 'zh-CN',
    };
}