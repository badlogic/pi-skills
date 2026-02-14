#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1);

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const result = await p.evaluate(() => {
	// Helper to safely get link information
	const getLinkInfo = (link) => {
		const closestLandmark = link.closest('nav, header, main, footer, aside, [role="navigation"], [role="banner"], [role="main"], [role="contentinfo"], [role="complementary"]');
		return {
			text: (link.textContent?.trim() || link.getAttribute('aria-label') || '').slice(0, 80),
			href: link.href || link.getAttribute('data-href') || '',
			location: closestLandmark?.tagName?.toLowerCase() || 
			          closestLandmark?.getAttribute('role') || 
			          'other',
			ariaCurrent: link.getAttribute('aria-current')
		};
	};

	return {
		location: {
			url: window.location.href,
			path: window.location.pathname,
			title: document.title
		},
		
		// Current page indicator
		currentPage: document.querySelector('[aria-current="page"]')?.textContent?.trim() || null,
		
		links: Array.from(document.querySelectorAll('a[href], [role="link"]'))
			.map(getLinkInfo)
			.filter(link => link.href || link.text) // Remove empty links
			.slice(0, 200),
		
		outline: Array.from(document.querySelectorAll('h1, h2, h3'))
			.map(h => ({ 
				level: h.tagName, 
				text: h.textContent?.trim().slice(0, 80) 
			})),
		
		landmarks: {
			navigation: Array.from(document.querySelectorAll('nav, [role="navigation"]')).length,
			main: Array.from(document.querySelectorAll('main, [role="main"]')).length,
			header: Array.from(document.querySelectorAll('header, [role="banner"]')).length,
			footer: Array.from(document.querySelectorAll('footer, [role="contentinfo"]')).length,
			sidebar: Array.from(document.querySelectorAll('aside, [role="complementary"]')).length,
			search: Array.from(document.querySelectorAll('[role="search"]')).length
		},
		
		interactive: {
			buttons: document.querySelectorAll('button, [role="button"]').length,
			forms: document.forms.length,
			inputs: document.querySelectorAll('input, textarea, select').length,
			menus: document.querySelectorAll('[role="menu"], [role="menubar"]').length,
			tabs: document.querySelectorAll('[role="tab"], [role="tablist"]').length,
			dialogs: document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"]').length
		},
		
		// Navigation-specific elements
		navigationLinks: Array.from(document.querySelectorAll('nav a, [role="navigation"] a, header a, [role="banner"] a'))
			.map(a => ({
				text: (a.textContent?.trim() || a.getAttribute('aria-label') || '').slice(0, 80),
				href: a.href,
				current: a.getAttribute('aria-current') === 'page'
			}))
			.filter(link => link.href && link.text)
			.slice(0, 50),
		
		forms: Array.from(document.forms).map(f => ({
			action: f.action,
			method: f.method,
			name: f.name,
			id: f.id,
			fields: Array.from(f.elements)
				.filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
				.map(el => ({
					type: el.type,
					name: el.name,
					id: el.id,
					label: el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.placeholder || ''
				}))
		})).slice(0, 5)
	};
});

console.log(JSON.stringify(result, null, 2));

await b.disconnect();
