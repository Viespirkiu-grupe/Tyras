Aggregate claims in tech-report.md in {{CASE_DIR}} and organize them in structure.
Later on tech report will be used to raise bug reports and fix them.
Do not lose important information while organizing the structure.
Write down tech-report-summary.md

Distinguish between main categories:

1. Domain and data problems:
    - Missing data or inconsistencies in the data that are detected while using Viespirkiai MCP
    - Reported problems will be passed to the data, viespirkiai MCP and database teams
2. Technical MCP problems:
    - Technical struggles and failures while using Viespirkiai MCP, for example API errors, timeouts, or other technical
      issues that hindered the investigation process
    - Reported problems will be passed to the MCP development team
3. Agentic system problems:
    - Problems with this agentic system, system's reasoning, or the way it processes and analyzes data that led to false
      positives, false negatives, or other issues in the investigation process. Problems with themes, poor selection of
      indicators, or incorrect or poorly defined themes, SQL query examples, MCP tool call proposals.
    - Reported problems will be passed to the agentic system development team that maintains this agentic system

For each listed problem write down:

1. Problem name
2. Problem description
3. Have you used workarounds to mitigate the problem? If yes, describe the workaround and how it helped. If no, explain
   why not.
4. How critical is this problem for the investigation process? (Low, Medium, High). If issue took a lot of LLM tokes,
   always mark it as High priority to be fixed.
5. How you think the problem could be fixed or what is needed to mitigate or fully resolve the problem? Write down
   suggestions or ideas.

If the problem is related to this agentic system, you can investigate themes [themes](../docs/themes) or agent
prompts [agents](../.claude/agents). If problem is related to MCP tools, you can try using those tools if it is required
to get more information about the problem. Now we have the goal to clearly aggregate and categorise problems.