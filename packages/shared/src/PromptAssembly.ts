/**
 * Prompt assembly (PRD §12). Final model input = main design prompt + slide
 * prompt, assembled here on the server. The user and agents never see or manage
 * the concatenation — they edit the two parts.
 */
export function assemblePrompt(mainDesignPrompt: string, slidePrompt: string): string {
  return `${mainDesignPrompt.trim()}\n\n--- SLIDE CONTENT ---\n${slidePrompt.trim()}`;
}
