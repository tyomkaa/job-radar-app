// Real JS integration test without browser/network or private user data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

const jobs = [];
const context = createContext({
  jobs,
  activeFilter: 'UA_EMPLOYERS',
  norm: value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
  sortJobs: x => [...x],
  v21LocallyEligible: job => /warszaw|warsaw/i.test(job.location)
    || (/remote/i.test(job.work_mode || '') && /poland|polska/i.test(job.location)),
  getVisibleJobs: () => [],
  render: () => {},
  document: {querySelector: () => null}
});
runInContext(readFileSync('v27-ukrainian-employers.js','utf8'), context);
jobs.push(
  {id:'a',company:'Nova Post Poland Sp. z o.o.',location:'Warszawa'},
  {id:'b',company:'Creatio',location:'Warszawa'},
  {id:'c',company:'N-iX',location:'Warszawa'},
  {id:'d',company:'SoftServe Poland',location:'Kraków',work_mode:'Office'},
  {id:'e',company:'Intellias',location:'Poland',work_mode:'Remote'},
  {id:'f',company:'Nova Innovations Poland',location:'Warszawa'},
  {id:'g',company:'Unrelated Employer',location:'Warszawa'}
);
const filtered = context.getVisibleJobs();
assert.deepEqual(Array.from(filtered,x=>x.id),['a','b','c','e'],
  'Only verified company aliases and Poland-eligible jobs should appear');
context.activeFilter='ALL';
assert.equal(context.getVisibleJobs().length,0,
  'Non-UA tabs must delegate to the existing application filtering chain');
assert.equal(jobs.length,7,'Watchlist must not mutate source jobs');
console.log('Ukrainian employer filter: alias, scope, no substring false positives, delegation PASS');
