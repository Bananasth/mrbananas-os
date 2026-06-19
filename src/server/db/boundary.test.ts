import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// A bare side-effect import of the service-role admin client.
const adminImport = "import '../../server/db/admin'\n"

async function ruleIdsFor(filePath: string): Promise<Array<string | null>> {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(adminImport, { filePath })
  return result?.messages.map((message) => message.ruleId) ?? []
}

describe('server-only admin import boundary', () => {
  it('forbids importing the admin client from a business module', async () => {
    const ids = await ruleIdsFor('src/modules/sample/thing.ts')
    expect(ids).toContain('no-restricted-imports')
  })

  it('permits importing the admin client within src/server', async () => {
    const ids = await ruleIdsFor('src/server/db/thing.ts')
    expect(ids).not.toContain('no-restricted-imports')
  })
})
