// ../common/actionVersionUtil.ts
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
var actionScriptUrl = fileURLToPath(import.meta.url);
var actionPath = path.dirname(actionScriptUrl);
async function fetchLatestActionVersion(actionName) {
  const response = await fetch(`https://raw.githubusercontent.com/DecentAppsNet/${actionName}/refs/heads/main/version.txt`);
  if (!response.ok) throw new Error(`Failed to fetch action version: ${response.statusText}`);
  return (await response.text()).trim();
}
async function fetchLocalActionVersion() {
  try {
    const localFilepath = path.join(actionPath, "version.txt");
    const versionContent = await readFile(localFilepath, "utf8");
    return versionContent.trim();
  } catch (error2) {
    throw new Error(`Failed to read local action version: ${error2.message}`);
  }
}

// ../common/ExpectedError.ts
var ExpectedError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExpectedError";
  }
};
var ExpectedError_default = ExpectedError;

// ../common/githubUtil.ts
function error(message) {
  console.error(`::error::${message}`);
}
function warning(message) {
  console.warn(`::warning::${message}`);
}
function notice(message) {
  console.log(`::notice::${message}`);
}
function finalSuccess(message) {
  notice(`\u2705 ${message}`);
}
function info(message) {
  console.log(message);
}
function fatalError(message) {
  error(message);
  process.exit(1);
}
function startGroup(name) {
  console.log(`::group::${name}`);
}
function endGroup() {
  console.log(`::endgroup::`);
}
function getInput(name, required = false) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = process.env[key];
  if (required && !value) fatalError(`Input ${name} is required.`);
  return value || "";
}
function getRepoOwner() {
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!repoOwner) throw new ExpectedError_default("GITHUB_REPOSITORY_OWNER environment variable is not set.");
  return repoOwner;
}
function runningInGithubCI() {
  return process.env.GITHUB_ACTIONS === "true";
}

// ../common/httpUtil.ts
import * as https from "node:https";
async function httpsRequestWithBodyFromText(options, text) {
  return new Promise((resolve, reject) => {
    if (!options.headers) options.headers = {};
    options.headers["Content-Length"] = Buffer.byteLength(text);
    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", async () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: responseData });
        } else {
          reject(new ExpectedError_default(`Request to ${options.hostname} failed with status code: ${res.statusCode}. Response: ${responseData}`));
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.write(text);
    req.end();
  }).catch((err) => {
    throw err;
  });
}

// ../common/toolVersionUtil.ts
var VERSION = "1.0";
var DECENT_TOOLS_VERSION = `v${VERSION} Decent Tools`;

// ../common/stageIndexUtil.ts
function _parseStageIndexFormat(htmlText) {
  const versionPrefix = `<!-- v`;
  const versionPrefixStartPos = htmlText.indexOf(versionPrefix);
  if (versionPrefixStartPos === -1) return null;
  const versionStartPos = versionPrefixStartPos + versionPrefix.length;
  const versionEndPos = htmlText.indexOf(" ", versionStartPos);
  if (versionEndPos === -1) return null;
  return htmlText.substring(versionStartPos, versionEndPos);
}
function _parseVariableValue(html, variableName) {
  const variablePrefix = ` ${variableName}='`;
  const variablePrefixStartPos = html.indexOf(variablePrefix);
  if (variablePrefixStartPos === -1) return null;
  const valueStartPos = variablePrefixStartPos + variablePrefix.length;
  const valueEndPos = html.indexOf(`'`, valueStartPos);
  if (valueEndPos === -1) return null;
  return html.substring(valueStartPos, valueEndPos);
}
function _findSupportedStageIndexFormat(htmlText) {
  const version = _parseStageIndexFormat(htmlText);
  if (!version) throw Error(`Failed to parse stage index format version.`);
  if (version !== VERSION) throw Error(`Unsupported stage index format version ${version}.`);
  return version;
}
function _createEmptyVarsObject() {
  return { productionVersion: "", rollbackVersion: "", stageVersion: "" };
}
function createStageIndex(appName, stageVersion, productionVersion, rollbackVersion) {
  const stageIndexUrl = `/_${appName}/${stageVersion}/`;
  return `<!DOCTYPE html><html><head><title>Stage Index for ${appName}</title><script>
<!-- ${DECENT_TOOLS_VERSION}. Hand-edit at your own risk! -->
const productionVersion='${productionVersion}';
const rollbackVersion='${rollbackVersion}';
const stageVersion='${stageVersion}';
window.location.href='${stageIndexUrl}';
</script></head><body></body></html>`;
}
async function findAppVersions(appName) {
  const url = `https://decentapps.net/_${appName}/index.html`;
  const response = await fetch(url);
  if (!response.ok) return _createEmptyVarsObject();
  const htmlText = await response.text();
  try {
    _findSupportedStageIndexFormat(htmlText);
  } catch (error2) {
    warning(`Could not retrieve app versions from existing stage index at ${url}: ${error2.message}.`);
    return _createEmptyVarsObject();
  }
  const productionVersion = _parseVariableValue(htmlText, "productionVersion") ?? "";
  const rollbackVersion = _parseVariableValue(htmlText, "rollbackVersion") ?? "";
  const stageVersion = _parseVariableValue(htmlText, "stageVersion") ?? "";
  return { stageVersion, productionVersion, rollbackVersion };
}

// ../common/partnerServiceClient.ts
var API_HOSTNAME = "partner.decentapps.net";
async function putStageIndex(repoOwner, partnerApiKey, appName, stageVersion, productionVersion, rollbackVersion, updateRoute) {
  const path2 = updateRoute ? `/api/deployment/${appName}/index.html?updateRoute=true` : `/api/deployment/${appName}/index.html`;
  const options = {
    hostname: API_HOSTNAME,
    path: path2,
    port: 443,
    method: "PUT",
    headers: {
      "Content-Type": "text/html",
      "Authorization": `Bearer ${partnerApiKey}`,
      "x-repo-owner": repoOwner,
      "Accept": "application/json"
    }
  };
  const stageIndexText = createStageIndex(appName, stageVersion, productionVersion, rollbackVersion);
  const result = await httpsRequestWithBodyFromText(options, stageIndexText);
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`Failed to upload file to partner service. Status code: ${result.statusCode}. Response: ${result.body}`);
  }
}

// main.ts
async function rollbackAction() {
  try {
    startGroup("Checking action version");
    info(`fetch local action version`);
    const localActionVersion = await fetchLocalActionVersion();
    info("fetch latest action version");
    const latestActionVersion = await fetchLatestActionVersion("rollback");
    if (localActionVersion !== latestActionVersion) {
      warning(`Local action version ${localActionVersion} does not match latest action version ${latestActionVersion}. Consider updating your action.`);
    } else {
      info(`Local action version ${localActionVersion} matches latest action version.`);
    }
    endGroup();
    startGroup("Collecting inputs");
    info("repo owner");
    const repoOwner = getRepoOwner();
    info("Decent API key");
    const apiKey = getInput("api-key", true);
    info("app name");
    const appName = getInput("app-name", true);
    endGroup();
    startGroup("Updating stage index");
    info("fetch app versions");
    let { stageVersion, productionVersion, rollbackVersion } = await findAppVersions(appName);
    if (!rollbackVersion || rollbackVersion === productionVersion) fatalError(`No rollback version available for app ${appName}.`);
    productionVersion = rollbackVersion;
    rollbackVersion = "";
    info(`uploading new stage index - stage version=${stageVersion}, production version=${productionVersion}, rollback version=${rollbackVersion}`);
    await putStageIndex(repoOwner, apiKey, appName, stageVersion, productionVersion, rollbackVersion, true);
    endGroup();
    const productionUrl = `https://decentapps.net/${appName}/`;
    finalSuccess(`Successfully rolled back production URL "${productionUrl}" to ${productionVersion} version. Staging remains at ${stageVersion} version.`);
  } catch (error2) {
    const showErrorDetails = !runningInGithubCI() || error2.name === "ExpectedError";
    const errorMessage = showErrorDetails ? error2.message : "An unexpected error occurred.";
    fatalError(errorMessage);
  }
}
rollbackAction();
