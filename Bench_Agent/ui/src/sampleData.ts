import { ActionItem, AlertRow, DeploymentMatch, DigestData, ForecastRow, FreezeRow, RmNudge, SnapshotData } from './types'

const TODAY = new Date().toISOString().slice(0, 10)

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const sampleSnapshot: SnapshotData = {
  total_headcount: 53,
  run_date: TODAY,
  status_counts: { available: 4, proposed: 12, allocated: 3, nafd: 20, other: 14 },
  current_vs_future: { 'Current bench': 26, 'Future bench': 27 },
  aging_distribution: { '>91 days': 26, 'Unknown': 27 },
  by_location: { Onsite: 40, Offshore: 13 },
  exclusion_audit: {
    total_input_rows: 1000,
    excluded_on_leave: 335,
    excluded_bz: 416,
    excluded_d_rated: 384,
    excluded_exit: 469,
    excluded_resignation: 331,
    excluded_campus_no_fbd: 96,
    excluded_cao_new: 317,
    total_excluded: 947,
    deployable_bench_count: 53,
  },
  skill_rating_distribution: { '1': 114, '2': 139, '3': 120, '4': 135 },
  skill_staleness: { 'ERP-SAP': 8, 'Java': 7, 'Python': 6, 'AWS': 5, 'Docker': 4, 'React': 4, 'Spring Boot': 3, 'Selenium': 3, 'Microservices': 2, 'MySQL': 2 },
  grade_supply: { IS6: 3, DP5: 1, IS4: 3, IS1: 1, DT5: 1, IS2: 2, IS3: 0, DP3: 0, DT1: 0, DT3: 0, IS8: 3, LN5: 2, BC4: 2, BC5: 1 },
  grade_demand: { DP3: 20, DT1: 19, DP5: 19, IS4: 18, IS3: 15, IS1: 15, DT5: 15, IS6: 15, DT3: 14, IS2: 14, IS8: 0, BC4: 0, BC5: 0 },
}

export const sampleForecast: ForecastRow[] = Array.from({ length: 91 }, (_, i) => ({
  forecast_date: addDays(i),
  days_from_today: i,
  total_forecast_bench: i >= 88 ? 1 : 0,
  confirmed_count: i >= 88 ? 1 : 0,
  projected_count: 0,
  forecast_confidence_band: 'HIGH',
  bucket: i <= 30 ? '30d' : i <= 60 ? '60d' : '90d',
}))

export const sampleAlerts: AlertRow[] = [
  { org_slice: 'CYBER_SEC',      current_bench_count: 6, bench_threshold: 3,  breach_amount:  3, is_breached: true,  alert_severity: 'MEDIUM', recommended_action: 'Review bench pipeline for CYBER_SEC. Current bench (6) exceeds threshold (3) by 3. Consider hiring freeze advisory.', run_date: TODAY },
  { org_slice: 'DIGITAL_ENG',    current_bench_count: 4, bench_threshold: 5,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'CLOUD_INFRA',    current_bench_count: 3, bench_threshold: 4,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'DATA_ANALYTICS', current_bench_count: 5, bench_threshold: 6,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'JAVA_PRACTICE',  current_bench_count: 7, bench_threshold: 8,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'QA_AUTOMATION',  current_bench_count: 3, bench_threshold: 4,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'SAP_PRACTICE',   current_bench_count: 9, bench_threshold: 10, breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'DEVOPS_SRE',     current_bench_count: 2, bench_threshold: 3,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'MOBILE_DEV',     current_bench_count: 2, bench_threshold: 3,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'AI_ML',          current_bench_count: 4, bench_threshold: 5,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'FULLSTACK_WEB',  current_bench_count: 6, bench_threshold: 7,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'ERP_FUNCTIONAL', current_bench_count: 3, bench_threshold: 4,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'TESTING_PERF',   current_bench_count: 2, bench_threshold: 3,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
  { org_slice: 'ARCHITECTURE',   current_bench_count: 1, bench_threshold: 2,  breach_amount: -1, is_breached: false, alert_severity: 'OK',     recommended_action: 'No action required.', run_date: TODAY },
]

export const sampleFreeze: FreezeRow[] = [
  { skill: 'ERP-SAP',       bench_count: 7, near_term_releases: 0, total_supply: 7, open_demand_count: 2, supply_surplus:  5, freeze_recommended: true,  avg_skill_rating: 1.5, advisory_note: 'Supply (7) exceeds demand (2) by 5 for ERP-SAP. Recommend hiring pause.',           run_date: TODAY, llm_narrative: 'Implement an immediate hiring freeze for ERP-SAP. Bench surplus of 5 vs demand 2. Low avg rating 1.5 indicates upskilling priority. Review: 30-day.' },
  { skill: 'Selenium',      bench_count: 5, near_term_releases: 0, total_supply: 5, open_demand_count: 2, supply_surplus:  3, freeze_recommended: true,  avg_skill_rating: 3.5, advisory_note: 'Supply (5) exceeds demand (2) by 3 for Selenium. Recommend hiring pause.',           run_date: TODAY, llm_narrative: 'Apply targeted hiring freeze for Selenium. Surplus 3, avg rating 3.5 — competent bench available. Defer hires. Review: 30-day.' },
  { skill: 'Spring Boot',   bench_count: 5, near_term_releases: 0, total_supply: 5, open_demand_count: 3, supply_surplus:  2, freeze_recommended: true,  avg_skill_rating: 3.0, advisory_note: 'Supply (5) exceeds demand (3) by 2 for Spring Boot. Recommend hiring pause.',         run_date: TODAY, llm_narrative: 'Enact hiring freeze for Spring Boot except critical needs. Surplus 2, avg rating 3.0. Review: 60-day.' },
  { skill: 'Docker',        bench_count: 4, near_term_releases: 0, total_supply: 4, open_demand_count: 3, supply_surplus:  1, freeze_recommended: true,  avg_skill_rating: 3.0, advisory_note: 'Supply (4) exceeds demand (3) by 1 for Docker. Recommend hiring pause.',             run_date: TODAY, llm_narrative: 'Initiate hiring freeze for Docker unless urgent. Surplus 1. Evaluate redeployment. Review: 60-day.' },
  { skill: 'AWS',           bench_count: 4, near_term_releases: 0, total_supply: 4, open_demand_count: 3, supply_surplus:  1, freeze_recommended: true,  avg_skill_rating: 2.0, advisory_note: 'Supply (4) exceeds demand (3) by 1 for AWS. Recommend hiring pause.',               run_date: TODAY, llm_narrative: 'Freeze AWS hiring except critical cloud initiatives. Surplus 1. Review: 60-day.' },
  { skill: 'Microservices', bench_count: 4, near_term_releases: 0, total_supply: 4, open_demand_count: 3, supply_surplus:  1, freeze_recommended: true,  avg_skill_rating: 1.0, advisory_note: 'Supply (4) exceeds demand (3) by 1 for Microservices. Recommend hiring pause.',     run_date: TODAY, llm_narrative: 'Suspend Microservices hiring. Surplus 1, very low avg rating 1.0 — focus reskilling. Review: 60-day.' },
  { skill: 'MySQL',         bench_count: 3, near_term_releases: 0, total_supply: 3, open_demand_count: 2, supply_surplus:  1, freeze_recommended: true,  avg_skill_rating: 1.5, advisory_note: 'Supply (3) exceeds demand (2) by 1 for MySQL. Recommend hiring pause.',             run_date: TODAY, llm_narrative: 'Impose hiring freeze for MySQL. Surplus 1, avg rating 1.5. Review: 60-day.' },
  { skill: 'Apache Spark',  bench_count: 4, near_term_releases: 0, total_supply: 4, open_demand_count: 3, supply_surplus:  1, freeze_recommended: true,  avg_skill_rating: 1.5, advisory_note: 'Supply (4) exceeds demand (3) by 1 for Apache Spark. Recommend hiring pause.',      run_date: TODAY, llm_narrative: 'Pause Apache Spark hiring until bench reallocated. Surplus 1. Review: 60-day.' },
  { skill: 'Java',          bench_count: 2, near_term_releases: 0, total_supply: 2, open_demand_count: 8, supply_surplus: -6, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (8) exceeds supply (2) by 6 for Java. No freeze needed.',                   run_date: TODAY },
  { skill: 'Python',        bench_count: 3, near_term_releases: 0, total_supply: 3, open_demand_count: 9, supply_surplus: -6, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (9) exceeds supply (3) by 6 for Python. No freeze needed.',                 run_date: TODAY },
  { skill: 'React',         bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 6, supply_surplus: -5, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (6) exceeds supply (1) by 5 for React. No freeze needed.',                   run_date: TODAY },
  { skill: 'Angular',       bench_count: 2, near_term_releases: 0, total_supply: 2, open_demand_count: 5, supply_surplus: -3, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (5) exceeds supply (2) by 3 for Angular. No freeze needed.',                 run_date: TODAY },
  { skill: 'Node.js',       bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 4, supply_surplus: -3, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (4) exceeds supply (1) by 3 for Node.js. No freeze needed.',                 run_date: TODAY },
  { skill: 'Kubernetes',    bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 3, supply_surplus: -3, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (0) by 3 for Kubernetes. No freeze needed.',              run_date: TODAY },
  { skill: 'Terraform',     bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 3, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (1) by 2 for Terraform. No freeze needed.',               run_date: TODAY },
  { skill: 'PostgreSQL',    bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 3, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (1) by 2 for PostgreSQL. No freeze needed.',             run_date: TODAY },
  { skill: 'Snowflake',     bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 2, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (0) by 2 for Snowflake. No freeze needed.',              run_date: TODAY },
  { skill: 'Tableau',       bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 3, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (1) by 2 for Tableau. No freeze needed.',                run_date: TODAY },
  { skill: 'Power BI',      bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 2, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (0) by 2 for Power BI. No freeze needed.',              run_date: TODAY },
  { skill: 'Azure',         bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 3, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (1) by 2 for Azure. No freeze needed.',                  run_date: TODAY },
  { skill: 'Scala',         bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 2, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (0) by 2 for Scala. No freeze needed.',                  run_date: TODAY },
  { skill: 'Go Lang',       bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 2, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (0) by 2 for Go Lang. No freeze needed.',                run_date: TODAY },
  { skill: 'TypeScript',    bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 3, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (3) exceeds supply (1) by 2 for TypeScript. No freeze needed.',             run_date: TODAY },
  { skill: 'Kafka',         bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 2, supply_surplus: -2, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (0) by 2 for Kafka. No freeze needed.',                  run_date: TODAY },
  { skill: 'MongoDB',       bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for MongoDB. No freeze needed.',                run_date: TODAY },
  { skill: 'Redis',         bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Redis. No freeze needed.',                  run_date: TODAY },
  { skill: 'Cassandra',     bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Cassandra. No freeze needed.',              run_date: TODAY },
  { skill: 'GraphQL',       bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for GraphQL. No freeze needed.',               run_date: TODAY },
  { skill: 'Spark SQL',     bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Spark SQL. No freeze needed.',             run_date: TODAY },
  { skill: 'Hive',          bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Hive. No freeze needed.',                  run_date: TODAY },
  { skill: 'Jenkins',       bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Jenkins. No freeze needed.',               run_date: TODAY },
  { skill: 'Ansible',       bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Ansible. No freeze needed.',               run_date: TODAY },
  { skill: 'Splunk',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Splunk. No freeze needed.',                run_date: TODAY },
  { skill: 'Dynatrace',     bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Dynatrace. No freeze needed.',             run_date: TODAY },
  { skill: 'JMeter',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for JMeter. No freeze needed.',                run_date: TODAY },
  { skill: 'Postman',       bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for Postman. No freeze needed.',               run_date: TODAY },
  { skill: 'Cucumber',      bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Cucumber. No freeze needed.',              run_date: TODAY },
  { skill: 'TestNG',        bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for TestNG. No freeze needed.',                run_date: TODAY },
  { skill: 'Maven',         bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Maven. No freeze needed.',                 run_date: TODAY },
  { skill: 'REST API',      bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for REST API. No freeze needed.',              run_date: TODAY },
  { skill: 'gRPC',          bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for gRPC. No freeze needed.',                  run_date: TODAY },
  { skill: 'CQRS',          bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for CQRS. No freeze needed.',                  run_date: TODAY },
  { skill: 'Hadoop',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Hadoop. No freeze needed.',                run_date: TODAY },
  { skill: 'GitLab CI',     bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for GitLab CI. No freeze needed.',             run_date: TODAY },
  { skill: 'Chef',          bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Chef. No freeze needed.',                  run_date: TODAY },
  { skill: 'Puppet',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Puppet. No freeze needed.',                run_date: TODAY },
  { skill: 'AppDynamics',   bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for AppDynamics. No freeze needed.',          run_date: TODAY },
  { skill: 'Selenium Grid', bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Selenium Grid. No freeze needed.',        run_date: TODAY },
  { skill: 'SoapUI',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for SoapUI. No freeze needed.',               run_date: TODAY },
  { skill: 'MyBatis',       bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for MyBatis. No freeze needed.',              run_date: TODAY },
  { skill: 'Hibernate',     bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for Hibernate. No freeze needed.',             run_date: TODAY },
  { skill: 'Swift',         bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Swift. No freeze needed.',                run_date: TODAY },
  { skill: 'Kotlin',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Kotlin. No freeze needed.',               run_date: TODAY },
  { skill: 'Ruby',          bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Ruby. No freeze needed.',                 run_date: TODAY },
  { skill: 'Spring MVC',    bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for Spring MVC. No freeze needed.',            run_date: TODAY },
  { skill: 'JPA',           bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for JPA. No freeze needed.',                  run_date: TODAY },
  { skill: 'Gradle',        bench_count: 0, near_term_releases: 0, total_supply: 0, open_demand_count: 1, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (1) exceeds supply (0) by 1 for Gradle. No freeze needed.',               run_date: TODAY },
  { skill: 'SOAP',          bench_count: 1, near_term_releases: 0, total_supply: 1, open_demand_count: 2, supply_surplus: -1, freeze_recommended: false, avg_skill_rating: null, advisory_note: 'Demand (2) exceeds supply (1) by 1 for SOAP. No freeze needed.',                 run_date: TODAY },
]

export const sampleActions: ActionItem[] = [
  { rule: 'R1', priority: 'IMMEDIATE', owner: 'RM / Staffing Lead',         action: 'Initiate deployment push for 12 at-risk bench employees (>60 days bench, no proposed status)', rationale: '12 employees have been on bench >60 days without a proposed status. Top org slices: CYBER_SEC: 4, SAP_PRACTICE: 3, DIGITAL_ENG: 2. Every idle day raises bench cost.', run_date: TODAY },
  { rule: 'R3', priority: 'IMMEDIATE', owner: 'BU Head / RM',               action: 'Review bench pipeline for CYBER_SEC — threshold exceeded by 3', rationale: 'CYBER_SEC bench (6) exceeds configured threshold (3). Severity: MEDIUM. Activate hiring freeze advisory and accelerate demand matching.', run_date: TODAY },
  { rule: 'R1', priority: '7-DAY',     owner: 'Staffing / Project Lead',    action: 'Investigate NAFD population — 29 employees (36% of bench) in NAFD status', rationale: 'NAFD represents 36% of bench (threshold: 20%). Determine which NAFD reasons are resolvable and reassign where possible to reduce this figure within 7 days.', run_date: TODAY },
  { rule: 'R2', priority: '7-DAY',     owner: 'Project RM / Delivery Manager', action: 'Confirm or update 5 projected (low-confidence) releases in the 30-day window', rationale: '5 upcoming releases carry MEDIUM/LOW confidence. Stale release dates degrade forecast accuracy. Request updated status from delivery managers by end of week.', run_date: TODAY },
  { rule: 'R4', priority: '30-DAY',    owner: 'Talent Acquisition / BU Head', action: 'Implement hiring freeze for 8 skill cluster(s): ERP-SAP, Selenium, Spring Boot, Docker, AWS, Microservices, MySQL, Apache Spark', rationale: 'Bench supply exceeds open demand for 8 skill clusters (combined surplus: 14). Continuing recruitment inflates bench cost without matching deployment opportunity.', run_date: TODAY },
]

export const sampleNudges: RmNudge[] = [
  { nudge_id: 1, category: 'AT_RISK',           org_slice_or_skill: 'CYBER_SEC',    nudge_text: 'Action required: 4 employees in CYBER_SEC on bench >60 days with no proposed assignment. Initiate deployment push today.',                                                                supporting_data: { at_risk_count: 4, bench_threshold_days: 60 },                                             run_date: TODAY, urgency: 'HIGH',   email_subject: 'Action Required — Bench Status: CYBER_SEC',    email_body: 'Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nAction required: 4 employees in CYBER_SEC on bench >60 days with no proposed assignment. Initiate deployment push today.\n\nSupporting data: at_risk_count: 4; bench_threshold_days: 60\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)' },
  { nudge_id: 2, category: 'AT_RISK',           org_slice_or_skill: 'SAP_PRACTICE', nudge_text: 'Action required: 3 employees in SAP_PRACTICE on bench >60 days with no proposed assignment. Initiate deployment push today.',                                                               supporting_data: { at_risk_count: 3, bench_threshold_days: 60 },                                             run_date: TODAY, urgency: 'HIGH',   email_subject: 'Action Required — Bench Status: SAP_PRACTICE', email_body: 'Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nAction required: 3 employees in SAP_PRACTICE on bench >60 days with no proposed assignment. Initiate deployment push today.\n\nSupporting data: at_risk_count: 3; bench_threshold_days: 60\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)' },
  { nudge_id: 3, category: 'THRESHOLD_BREACH',  org_slice_or_skill: 'CYBER_SEC',    nudge_text: 'URGENT: CYBER_SEC bench (6) exceeds threshold (3) by 3. Activate hiring freeze advisory and accelerate demand matching immediately.',                                                        supporting_data: { current_bench_count: 6, bench_threshold: 3, breach_amount: 3, alert_severity: 'MEDIUM' }, run_date: TODAY, urgency: 'MEDIUM', email_subject: 'Action Required — Bench Status: CYBER_SEC',    email_body: 'Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nURGENT: CYBER_SEC bench (6) exceeds threshold (3) by 3. Activate hiring freeze advisory and accelerate demand matching immediately.\n\nSupporting data: current_bench_count: 6; bench_threshold: 3; breach_amount: 3; alert_severity: MEDIUM\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)' },
  { nudge_id: 4, category: 'HIRING_FREEZE',     org_slice_or_skill: 'ERP-SAP',      nudge_text: "Pause new hiring for 'ERP-SAP': supply (7) exceeds open demand (2) by 5. Review active job requisitions.",                                                                                  supporting_data: { total_supply: 7, open_demand_count: 2, supply_surplus: 5 },                               run_date: TODAY, urgency: 'MEDIUM', email_subject: 'Action Required — Bench Status: ERP-SAP',       email_body: "Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nPause new hiring for 'ERP-SAP': supply (7) exceeds open demand (2) by 5. Review active job requisitions.\n\nSupporting data: total_supply: 7; open_demand_count: 2; supply_surplus: 5\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)" },
  { nudge_id: 5, category: 'HIRING_FREEZE',     org_slice_or_skill: 'Selenium',     nudge_text: "Pause new hiring for 'Selenium': supply (5) exceeds open demand (2) by 3. Review active job requisitions.",                                                                                  supporting_data: { total_supply: 5, open_demand_count: 2, supply_surplus: 3 },                               run_date: TODAY, urgency: 'MEDIUM', email_subject: 'Action Required — Bench Status: Selenium',       email_body: "Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nPause new hiring for 'Selenium': supply (5) exceeds open demand (2) by 3. Review active job requisitions.\n\nSupporting data: total_supply: 5; open_demand_count: 2; supply_surplus: 3\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)" },
  { nudge_id: 6, category: 'FORECASTED_BREACH', org_slice_or_skill: 'SAP_PRACTICE', nudge_text: 'Pre-emptive alert: SAP_PRACTICE is within threshold now (9/10), but 4 upcoming releases will push it over within 30 days. Engage demand pipeline this week.',                                 supporting_data: { current_bench_count: 9, bench_threshold: 10, forecasted_bench_30d: 4 },                   run_date: TODAY, urgency: 'MEDIUM', email_subject: 'Action Required — Bench Status: SAP_PRACTICE', email_body: 'Hi Resource Manager,\n\nThis is an automated bench alert from the Bench Agent.\n\nPre-emptive alert: SAP_PRACTICE is within threshold now (9/10), but 4 upcoming releases will push it over within 30 days. Engage demand pipeline this week.\n\nSupporting data: current_bench_count: 9; bench_threshold: 10; forecasted_bench_30d: 4\n\nPlease take action within the recommended timeframe.\n\n— Bench Agent (advisory only)' },
]

export const sampleDeploymentMatches: DeploymentMatch[] = [
  { skill: 'Java',        bench_count: 2, open_demand_count: 8,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 2, endorsement_pending_count: 0, match_confidence: 'LOW',  gap: 8, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'Python',      bench_count: 3, open_demand_count: 9,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 3, endorsement_pending_count: 1, match_confidence: 'LOW',  gap: 9, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'React',       bench_count: 1, open_demand_count: 6,  matched_count: 1, endorsed_match_count: 1, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'HIGH', gap: 5, coverage_pct: 16.7,  coverage_label: 'PARTIAL', run_date: TODAY },
  { skill: 'Angular',     bench_count: 0, open_demand_count: 6,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'NONE', gap: 6, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'Node.js',     bench_count: 0, open_demand_count: 5,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'NONE', gap: 5, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'Kubernetes',  bench_count: 0, open_demand_count: 5,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'NONE', gap: 5, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'ERP-SAP',     bench_count: 3, open_demand_count: 2,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 1, endorsement_pending_count: 0, match_confidence: 'LOW',  gap: 2, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'Spring Boot', bench_count: 3, open_demand_count: 3,  matched_count: 1, endorsed_match_count: 1, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'HIGH', gap: 2, coverage_pct: 33.3,  coverage_label: 'PARTIAL', run_date: TODAY },
  { skill: 'Docker',      bench_count: 2, open_demand_count: 3,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 2, endorsement_pending_count: 0, match_confidence: 'LOW',  gap: 3, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'AWS',         bench_count: 3, open_demand_count: 3,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 1, endorsement_pending_count: 0, match_confidence: 'LOW',  gap: 3, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'Swift',       bench_count: 0, open_demand_count: 8,  matched_count: 0, endorsed_match_count: 0, stale_match_count: 0, endorsement_pending_count: 0, match_confidence: 'NONE', gap: 8, coverage_pct: 0.0,   coverage_label: 'NONE',    run_date: TODAY },
  { skill: 'MongoDB',     bench_count: 2, open_demand_count: 2,  matched_count: 1, endorsed_match_count: 1, stale_match_count: 1, endorsement_pending_count: 1, match_confidence: 'HIGH', gap: 1, coverage_pct: 50.0,  coverage_label: 'PARTIAL', run_date: TODAY },
]

export const sampleDigest: DigestData = {
  run_date: TODAY,
  total_bench: 80,
  at_risk_count: 12,
  nafd_count: 29,
  nafd_pct: 36.3,
  proposed_count: 19,
  breached_slices: ['CYBER_SEC'],
  forecasted_breach_slices: ['SAP_PRACTICE'],
  freeze_recommended_skills: ['ERP-SAP', 'Selenium', 'Spring Boot', 'Docker', 'AWS', 'Microservices', 'MySQL', 'Apache Spark'],
  combined_surplus: 14,
  bench_7d_forecast: 82,
  bench_30d_forecast: 91,
  aging_breakdown: { '>91 days': 39, '61-90 days': 15, '31-60 days': 14, '0-30 days': 12 },
  top_3_org_slices: { SAP_PRACTICE: 9, CYBER_SEC: 6, FULLSTACK_WEB: 6 },
  summary_text: `As of ${TODAY}: 80 deployable bench employees. 12 at-risk (>60 days, no proposed status). NAFD: 29 (36.3%). Proposed: 19. 1 org slice(s) currently breaching threshold (CYBER_SEC). Hiring freeze recommended for 8 skill clusters (combined surplus: 14). 7-day bench forecast peak: 82. 30-day bench forecast peak: 91.`,
}
