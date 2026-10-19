import { readFileSync } from 'node:fs'

export default {
  preview: {
    host: '0.0.0.0',
    port: 5327,
    allowedHosts: ['moboss.online', 'app.moboss.online'],
    https: {
      key: readFileSync(process.env.MOBOS_AUDIT_KEY || '/tmp/mobos-responsive-audit-key.pem'),
      cert: readFileSync(process.env.MOBOS_AUDIT_CERT || '/tmp/mobos-responsive-audit-cert.pem'),
    },
  },
}
