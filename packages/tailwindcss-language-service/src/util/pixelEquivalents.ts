import type { Container, Plugin, PluginCreator } from 'postcss'
import parseValue from 'postcss-value-parser'
import { parse as parseMediaQueryList } from '@csstools/media-query-list-parser'
import postcss from 'postcss'

type Comment = { index: number; value: string }

export function addPixelEquivalentsToValue(value: string, rootFontSize: number): string {
  if (!value.includes('rem')) {
    return value
  }

  parseValue(value).walk((node) => {
    if (node.type !== 'word') {
      return true
    }

    let unit = parseValue.unit(node.value)
    if (!unit || unit.unit !== 'rem') {
      return false
    }

    let commentStr = `/* ${parseFloat(unit.number) * rootFontSize}px */`
    value = value.slice(0, node.sourceEndIndex) + commentStr + value.slice(node.sourceEndIndex)

    return false
  })

  return value
}

export function addPixelEquivalentsToCss(css: string, rootFontSize: number): string {
  if (!css.includes('em')) {
    return css
  }

  let comments: Comment[] = []

  try {
    postcss([postcssPlugin({ comments, rootFontSize })]).process(css, { from: undefined }).css
  } catch {
    return css
  }

  let offset = 0
  for (let comment of comments) {
    let index = comment.index + offset
    let commentStr = `/* ${comment.value} */`
    css = css.slice(0, index) + commentStr + css.slice(index)
    offset += commentStr.length
  }

  return css
}

function postcssPlugin({
  comments,
  rootFontSize,
}: {
  comments: Comment[]
  rootFontSize: number
}): Plugin {
  return {
    postcssPlugin: 'plugin',
    AtRule: {
      media(atRule) {
        if (!atRule.params.includes('em')) {
          return
        }

        parseMediaQueryList(atRule.params).forEach((mediaQuery) => {
          mediaQuery.walk((entry) => {
            if (
              entry.node.type === 'token' &&
              entry.node.value[0] === 'dimension-token' &&
              (entry.node.value[4].type === 'integer' || entry.node.value[4].type === 'number') &&
              (entry.node.value[4].unit === 'rem' || entry.node.value[4].unit === 'em')
            ) {
              comments.push({
                index:
                  atRule.source.start.offset +
                  `@media${atRule.raws.afterName}${atRule.params}`.length -
                  (atRule.params.length - entry.node.value[3] - 1),
                value: `${entry.node.value[4].value * rootFontSize}px`,
              })
            }
          })
        })
      },
    },
    Declaration(decl) {
      if (!decl.value.includes('rem')) {
        return
      }

      parseValue(decl.value).walk((node) => {
        if (node.type !== 'word') {
          return true
        }

        let unit = parseValue.unit(node.value)
        if (!unit || unit.unit !== 'rem') {
          return false
        }

        comments.push({
          index:
            decl.source.start.offset +
            `${decl.prop}${decl.raws.between}`.length +
            node.sourceEndIndex,
          value: `${parseFloat(unit.number) * rootFontSize}px`,
        })

        return false
      })
    },
  }
}
postcssPlugin.postcss = true
