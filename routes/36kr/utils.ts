import crypto from 'node:crypto';

import { load } from 'cheerio';
import CryptoJS from 'crypto-js';

import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';

export const rootUrl = 'https://www.36kr.com';

// List pages (e.g. /information/web_news) 301-redirect from www.36kr.com to 36kr.com.
// Fetching the non-www host directly avoids the cross-origin redirect, which would
// strip the WAF cookie and result in a security-check page.
export const listUrl = 'https://36kr.com';

export const ProcessItem = (item) =>
    cache.tryGet(item.link, async () => {
        const detailResponse = await ofetch(item.link);

        const cipherTextList = detailResponse.match(/\{"state":"(.*)","isEncrypt":true\}/) ?? [];

        if (cipherTextList.length === 0) {
            const $ = load(detailResponse);
            item.description = $('div.articleDetailContent').html();
        } else {
            const key = CryptoJS.enc.Utf8.parse('efabccee-b754-4c');
            const content = JSON.parse(
                CryptoJS.AES.decrypt(cipherTextList[1], key, {
                    mode: CryptoJS.mode.ECB,
                    padding: CryptoJS.pad.Pkcs7,
                })
                    .toString(CryptoJS.enc.Utf8)
                    .toString()
            ).articleDetail.articleDetailData.data;
            item.description = content.widgetContent;
        }

        return item;
    });

const b64tou8a = (str) => Uint8Array.from(Buffer.from(str, 'base64'));
const b64tohex = (str) => Buffer.from(str, 'base64').toString('hex');
const s256 = (s1: Uint8Array, s2: string) => {
    const sha = crypto.createHash('sha256');
    sha.update(s1);
    sha.update(s2);
    return sha.digest('hex');
};

/**
 * Solve 36kr WAF PoW challenge (`_wafchallengeid` cookie).
 * @param cs - base64 encoded challenge `{"v":{"a":"...", "b":"timestamp", "c":"..."}, "s":"..."}`,
 * where `a` is a prefix, `c` is the expected sha256 hex of `a` + an integer, `s` is a signature.
 * @returns base64 encoded solved challenge with the `d` field set to the matching integer.
 */
const solveWafChallenge = (cs: string) => {
    const c = JSON.parse(Buffer.from(cs, 'base64').toString());
    const prefix = b64tou8a(c.v.a);
    const expect = b64tohex(c.v.c);

    for (let i = 0; i < 1_000_000; i++) {
        const hash = s256(prefix, i.toString());
        if (hash === expect) {
            c.d = Buffer.from(i.toString()).toString('base64');
            break;
        }
    }
    return Buffer.from(JSON.stringify(c)).toString('base64');
};

export const getWafTokenId = () =>
    cache.tryGet(
        '36kr:_waftokenid',
        async () => {
            const captchaResponse = await ofetch(rootUrl);

            const $ = load(captchaResponse);
            const payload = $('script')
                .text()
                .match(/atob\('(.*?)'\)\),/)?.[1];
            const response = solveWafChallenge(payload!);

            const tokenIdResponse = await ofetch.raw(rootUrl, {
                headers: {
                    Cookie: `_wafchallengeid=${response};`,
                },
                redirect: 'manual',
            });

            const _wafTokenId = tokenIdResponse.headers
                .getSetCookie()
                .find((cookie) => cookie.startsWith('_waftokenid='))
                ?.split(';', 1)[0]
                .split('=', 2)[1];

            return _wafTokenId as string;
        },
        300, // server-provided value
        false
    );
