* ==============================================================================
* AKALYSIS KNOWLEDGE BASE 
* Script: Stata 101 - Introduction for Epidemiologists
* Author: Dr Andrew Kingston
* Date: April 2026
* Description: A foundational workflow for loading and exploring health data.
* ==============================================================================

* ------------------------------------------------------------------------------
* SECTION 1: THE GOLDEN RULES OF THE ENVIRONMENT
* ------------------------------------------------------------------------------
* Rule 1: We never click buttons. Every action must be recorded here.
* Rule 2: We always start by clearing the Stata memory to prevent old data 
*         corrupting our new analysis.

clear all
set more off  // This stops Stata pausing output on long logs

* ------------------------------------------------------------------------------
* SECTION 2: LOADING THE DATA
* ------------------------------------------------------------------------------
* Stata has built-in datasets we can pull using the 'sysuse' command.
* We are loading 'bplong', a dataset measuring blood pressure over time.

sysuse bplong

* ------------------------------------------------------------------------------
* SECTION 3: THE BIRD'S-EYE VIEW
* ------------------------------------------------------------------------------
* Before we run any models, we need to know what we are holding.
* The 'describe' command tells us how many rows and columns we have.

describe

* The 'codebook' command is your most powerful tool in epidemiology.
* It prints distinct values for every variable and flags missing data.
* Highlight the word 'codebook' below and click 'Execute' to run it.

codebook


* ------------------------------------------------------------------------------
* SECTION 4: CONTINUOUS DATA (MEANS, MEDIANS, RANGES)
* ------------------------------------------------------------------------------
* We use 'summarize' (always spelt with a 'z' in Stata!) for continuous 
* numeric data like age, BMI, or blood pressure.

* Let's look at the basic summary of blood pressure ('bp'):
summarize bp

* If we want deeper epidemiological data (percentiles, variance, skewness), 
* we add the detail option after a comma:
summarize bp, detail


* ------------------------------------------------------------------------------
* SECTION 5: CATEGORICAL DATA (COUNTS AND FREQUENCIES)
* ------------------------------------------------------------------------------
* We cannot 'summarize' categorical data like Sex or Smoking Status because 
* calculating the "average" of Male/Female makes no sense.
* Instead, we generate frequency tables.

* Let's look at the breakdown of patient sex:
tabulate sex

* We can create cross-tabulations to look at two variables simultaneously.
* Let's look at sex across age groups (and ask Stata to calculate row percentages):
tabulate sex agegrp, row


* ==============================================================================
* EXERCISE COMPLETE! 
* You have successfully cleared memory, loaded data, and explored the schema.
* ==============================================================================
