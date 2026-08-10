# Templates de e-mail do Supabase Auth

O e-mail de confirmacao de cadastro e enviado pelo Supabase Auth, fora do codigo do Next.js.
Para trocar o texto padrao em ingles, configure o template no painel do Supabase.

## Confirm signup

No Supabase:

1. Abra o projeto da Renato Cortes Barbearia.
2. Va em Authentication.
3. Va em Emails ou Email Templates.
4. Abra o template Confirm signup.
5. Use o assunto:

```text
Confirme sua conta na Renato Cortes Barbearia
```

6. Cole o HTML de:

```text
docs/supabase-confirm-signup-template.html
```

7. Salve as alteracoes.

## Observacao

O link de confirmacao precisa manter a variavel:

```text
{{ .ConfirmationURL }}
```

Sem essa variavel, o usuario nao conseguira confirmar a conta.
