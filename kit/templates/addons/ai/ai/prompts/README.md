# Prompts

Each prompt is a separate file. Put this block at the top of the file:

```
<!--
purpose: [what this prompt does]
input: [variables: {{customer_name}}, {{invoice_text}}]
output: [format / schema name]
model: [AI_MODEL_* variable]
last change: YYYY-MM-DD — [what changed, eval result]
-->
```

A prompt change is a code change: it passes the eval, is committed, and is written to the CHANGELOG.
