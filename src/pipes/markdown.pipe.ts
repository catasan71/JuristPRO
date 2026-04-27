import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string | undefined, theme: 'dark' | 'light' = 'dark'): SafeHtml | string {
    if (!value) return '';
    try {
      const parsedHtml = marked.parse(value, {
        async: false,
        breaks: true,
        gfm: true,
      }) as string;

      let styledHtml = parsedHtml;

      if (theme === 'dark') {
        styledHtml = styledHtml
          .replace(/<a /g, '<a class="text-blue-400 hover:text-jurist-orange underline" target="_blank" ')
          .replace(/<pre>/g, '<pre class="bg-gray-900 border border-gray-700 p-4 rounded-lg my-4 overflow-x-auto text-sm text-gray-300">')
          .replace(/<code>/g, '<code class="bg-gray-800 text-jurist-orange px-1.5 py-0.5 rounded text-sm font-mono">')
          .replace(/<table>/g, '<div class="overflow-x-auto my-4"><table class="w-full text-left border-collapse border border-gray-700">')
          .replace(/<th>/g, '<th class="bg-gray-800 p-3 border border-gray-700 font-bold text-gray-200">')
          .replace(/<td>/g, '<td class="p-3 border border-gray-700 text-gray-300">')
          .replace(/<h1>/g, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">')
          .replace(/<h2>/g, '<h2 class="text-xl font-bold text-jurist-orange border-b border-gray-700 mt-6 pb-2 mb-4">')
          .replace(/<h3>/g, '<h3 class="text-lg font-bold text-white mt-5 mb-3">')
          .replace(/<ul>/g, '<ul class="list-disc pl-5 my-4 space-y-1 text-gray-300">')
          .replace(/<ol>/g, '<ol class="list-decimal pl-5 my-4 space-y-1 text-gray-300">')
          .replace(/<p>/g, '<p class="mb-4 text-gray-300 leading-relaxed text-justify">')
          .replace(/<strong>/g, '<strong class="text-white font-bold">')
          .replace(/<em>/g, '<em class="text-gray-400 italic">');
      } else {
        // Light mode styling
        styledHtml = styledHtml
          .replace(/<a /g, '<a class="text-blue-600 hover:text-jurist-orange underline" target="_blank" ')
          .replace(/<pre>/g, '<pre class="bg-gray-100 border border-gray-300 p-4 rounded-lg my-4 overflow-x-auto text-sm text-gray-800">')
          .replace(/<code>/g, '<code class="bg-gray-100 text-jurist-orange px-1.5 py-0.5 rounded text-sm font-mono">')
          .replace(/<table>/g, '<div class="overflow-x-auto my-4"><table class="w-full text-left border-collapse border border-gray-300">')
          .replace(/<th>/g, '<th class="bg-gray-200 p-3 border border-gray-300 font-bold text-gray-900">')
          .replace(/<td>/g, '<td class="p-3 border border-gray-300 text-gray-800">')
          .replace(/<h1>/g, '<h1 class="text-2xl font-bold text-black mt-6 mb-4">')
          .replace(/<h2>/g, '<h2 class="text-xl font-bold text-red-600 border-b border-gray-300 mt-6 pb-2 mb-4">')
          .replace(/<h3>/g, '<h3 class="text-lg font-bold text-black mt-5 mb-3">')
          .replace(/<ul>/g, '<ul class="list-disc pl-5 my-4 space-y-1 text-gray-800">')
          .replace(/<ol>/g, '<ol class="list-decimal pl-5 my-4 space-y-1 text-gray-800">')
          .replace(/<p>/g, '<p class="mb-4 text-gray-800 leading-relaxed text-justify">')
          .replace(/<strong>/g, '<strong class="text-black font-bold">')
          .replace(/<em>/g, '<em class="text-gray-600 italic">');
      }

      const sanitizedHtml = DOMPurify.sanitize(styledHtml, {
        ADD_ATTR: ['target']
      });
      return this.sanitizer.bypassSecurityTrustHtml(sanitizedHtml);
    } catch (e) {
      console.error('Markdown parsing error', e);
      return value;
    }
  }
}
