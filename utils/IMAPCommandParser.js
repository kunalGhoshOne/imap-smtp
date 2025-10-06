/**
 * IMAP Command Parser
 * Handles quoted strings, literals, and parenthesized lists
 */
class IMAPCommandParser {
  /**
   * Parse IMAP command line into parts
   * Handles: quoted strings, literals, parentheses
   * @param {string} line - Raw command line
   * @returns {Array} - Parsed command parts
   */
  static parse(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let inLiteral = false;
    let literalLength = 0;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inLiteral) {
        // Reading literal data
        current += char;
        literalLength--;
        if (literalLength === 0) {
          parts.push(current);
          current = '';
          inLiteral = false;
        }
        i++;
        continue;
      }

      if (char === '"' && !inQuotes) {
        // Start of quoted string
        inQuotes = true;
        i++;
        continue;
      }

      if (char === '"' && inQuotes) {
        // End of quoted string
        inQuotes = false;
        if (current) {
          parts.push(current);
          current = '';
        }
        i++;
        continue;
      }

      if (char === '{' && !inQuotes) {
        // Start of literal {length}
        const literalMatch = line.substring(i).match(/^\{(\d+)\}/);
        if (literalMatch) {
          literalLength = parseInt(literalMatch[1]);
          i += literalMatch[0].length;
          // Skip CRLF after literal indicator
          if (line[i] === '\r') i++;
          if (line[i] === '\n') i++;
          inLiteral = true;
          continue;
        }
      }

      if (char === ' ' && !inQuotes) {
        // Space separator
        if (current) {
          parts.push(current);
          current = '';
        }
        i++;
        continue;
      }

      if ((char === '(' || char === ')') && !inQuotes) {
        // Parentheses
        if (current) {
          parts.push(current);
          current = '';
        }
        parts.push(char);
        i++;
        continue;
      }

      // Regular character
      current += char;
      i++;
    }

    // Add remaining current
    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Parse a parenthesized list
   * Example: (FLAGS (\\Seen \\Flagged))
   */
  static parseParenthesizedList(parts, startIndex = 0) {
    const result = [];
    let depth = 0;
    let current = [];

    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i];

      if (part === '(') {
        depth++;
        if (depth > 1) {
          current.push(part);
        }
      } else if (part === ')') {
        depth--;
        if (depth === 0) {
          if (current.length > 0) {
            result.push(current);
          }
          return { result, endIndex: i };
        } else {
          current.push(part);
        }
      } else {
        current.push(part);
      }
    }

    return { result: current.length > 0 ? [current] : [], endIndex: parts.length - 1 };
  }

  /**
   * Extract flags from command
   * Example: (\\Seen \\Flagged) => ['\\Seen', '\\Flagged']
   */
  static extractFlags(parts) {
    const flags = [];
    let inParen = false;

    for (const part of parts) {
      if (part === '(') {
        inParen = true;
        continue;
      }
      if (part === ')') {
        inParen = false;
        continue;
      }
      if (inParen || part.startsWith('\\')) {
        flags.push(part);
      }
    }

    return flags;
  }

  /**
   * Parse message set (e.g., "1,2,5:8,*")
   */
  static parseMessageSet(setStr, maxMessage = 999999) {
    const numbers = [];
    const parts = setStr.split(',');

    for (const part of parts) {
      if (part.includes(':')) {
        const [start, end] = part.split(':');
        const startNum = start === '*' ? maxMessage : parseInt(start);
        const endNum = end === '*' ? maxMessage : parseInt(end);

        const min = Math.min(startNum, endNum);
        const max = Math.max(startNum, endNum);

        for (let i = min; i <= max && i <= maxMessage; i++) {
          if (!numbers.includes(i)) {
            numbers.push(i);
          }
        }
      } else if (part === '*') {
        if (!numbers.includes(maxMessage)) {
          numbers.push(maxMessage);
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num) && !numbers.includes(num)) {
          numbers.push(num);
        }
      }
    }

    return numbers.sort((a, b) => a - b);
  }

  /**
   * Unquote a string if it's quoted
   */
  static unquote(str) {
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1);
    }
    return str;
  }

  /**
   * Quote a string for IMAP response
   */
  static quote(str) {
    if (!str) return '""';
    // Quote if contains spaces or special chars
    if (/[\s(){}%*"\\\[\]]/.test(str)) {
      return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return str;
  }
}

module.exports = IMAPCommandParser;
