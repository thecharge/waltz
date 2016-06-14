import _ from "lodash";
import d3 from "d3";
import {buildHierarchies} from "../common";

const BINDINGS = {
    applications: '=',
    capabilities: '=',
    appCapabilities: '=',
    ratings: '=',
    sourceDataRatings: '='
};


const DEFAULT_SCORES = {
    R: 0,
    A: 0,
    G: 0
};


const initData = {
    capabilityTree: {
        options: {
            nodeChildren: "children",
            equality: (a, b) => a && b && a.id === b.id
        },
        data: []
    },
    appCapabilities: [],
    selectedCapabilities: [],
    ratings: [],
    visibility: {}
};


function calculateRequiredCapabilities(directCaps = [],
                                       allCaps = []) {
    const capsById = _.keyBy(allCaps, 'id');

    return _.chain(directCaps)
        .flatMap(cap => ([
            cap.level1,
            cap.level2,
            cap.level3,
            cap.level4,
            cap.level5]))
        .filter(id => id != null)
        .uniq()
        .map(id => capsById[id])
        .value()
}


function calculateDirectCapabilities(allCaps = [],
                                     appCapabilities = []) {
    const capsById = _.keyBy(allCaps, 'id');

    return _.chain(appCapabilities)
        .map('capabilityId')
        .uniq()
        .map(id => capsById[id])
        .value()
}


function calculateAppIdsByCapabilityId(appCapabilities = []) {
    return _.chain(appCapabilities)
        .groupBy('capabilityId')
        .mapValues(acs => _.map(acs, 'applicationId'))
        .value();
}


function isDescendant(capability, id) {
    return id === capability.level1
        || id === capability.level2
        || id === capability.level3
        || id === capability.level4
        || id === capability.level5;
}


function mkCapabilityDecorator(appCapabilities = [],
                               directCapabilities = [],
                               requiredCapabilities = []) {
    const appIdsByCapId = calculateAppIdsByCapabilityId(appCapabilities);
    const directCapIds = _.map(directCapabilities, 'id');

    return (capability) => {

        const id = capability.id;
        const directCount = appIdsByCapId[id] ? appIdsByCapId[id].length : 0;

        const cumulativeCount = _.chain(requiredCapabilities)
            .filter(c => isDescendant(c, id))
            .map(c => (appIdsByCapId[c.id] || []).length)
            .sum()
            .value();

        const decorations = {
            implied : ! _.includes(directCapIds, id),
            appCounts: {
                direct: directCount,
                cumulative: cumulativeCount
            }
        };

        return _.extend(capability, decorations);
    };
}


function scoreByBestRating(ratings = []) {
    const rags = _.map(ratings, 'ragRating');
    if (_.includes(rags, 'G')) return 'G';
    if (_.includes(rags, 'A')) return 'A';
    if (_.includes(rags, 'R')) return 'R';
    return "Z";
}


function enrichCapabilitiesWithScores(capabilities = [],
                                      scores) {

    const withDirectInfo = _.map(capabilities, cap => {

        const scoresForCap = scores[cap.id];

        const directDetails = _.map(
            _.toPairs(scoresForCap),
            ([appId, score]) => ({ appId, score }));

        const directScores = _.chain(scoresForCap)
            .values()
            .countBy()
            .defaults(DEFAULT_SCORES)
            .value();

        const result = {
            ...cap,
            details: {
                direct: directDetails
            },
            scores: {
                direct: directScores
            }
        };

        return result;
    });

    const withCumulativeScores = _.map(withDirectInfo, cap => {
        const relevantCapabilities = _.filter(withDirectInfo, c => isDescendant(c, cap.id));

        const cumulativeScores = _.chain(relevantCapabilities)
            .map('scores.direct')
            .reduce((acc, s) => ({
                R: acc.R + s.R,
                A: acc.A + s.A,
                G: acc.G + s.G,
                Z: acc.Z + s.Z
            }))
            .value();

        const cumulativeDetails = _.chain(relevantCapabilities)
            .flatMap('details.direct')
            .value();

        cap.scores.cumulative = cumulativeScores;
        cap.details.cumulative = cumulativeDetails;

        return cap;
    });

    return withCumulativeScores;
}


function calculateAppCountRange(capabilities = []) {
    const cumulativeCounts = _.map(capabilities, 'appCounts.cumulative');
    const mostApps = _.max(cumulativeCounts);
    const leastApps = _.minBy(cumulativeCounts);
    return [ leastApps, mostApps ];
}


function calculateScores(appCapabilities = [], ratings = [], calcScoreFn) {

    const viaRatings = d3
        .nest()
        .key(r => r.capability.id)
        .key(r => r.parent.id)
        .rollup(calcScoreFn)
        .map(ratings);  // cId -> appId -> { values: [ratings] }

    const unknown = d3
        .nest()
        .key(ac => ac.capabilityId)
        .key(ac => ac.applicationId)
        .rollup(() => "Z")
        .map(appCapabilities);

    return _.defaultsDeep(viaRatings, unknown);
}


function prepareCapabilities(allCapabilities = [],
                             appCapabilities = [],
                             ratings = [],
                             calcScoreFn = scoreByBestRating) {

    const directCapabilities = calculateDirectCapabilities(allCapabilities, appCapabilities);
    const requiredCapabilities = calculateRequiredCapabilities(directCapabilities, allCapabilities);
    const capabilityDecorator = mkCapabilityDecorator(appCapabilities, directCapabilities, requiredCapabilities);
    const capNodes = _.map(requiredCapabilities, capabilityDecorator);
    const scores = calculateScores(appCapabilities, ratings, calcScoreFn);

    return enrichCapabilitiesWithScores(capNodes, scores);
}


function build(allCapabilities = [],
               appCapabilities = [],
               ratings = [],
               calcScoreFn = scoreByBestRating) {

    const capabilities = prepareCapabilities(
        allCapabilities,
        appCapabilities,
        ratings,
        calcScoreFn);

    const treeData = buildHierarchies(capabilities);

    const result = {
        appCountRange: calculateAppCountRange(capabilities),
        capabilities,
        treeData
    };

    return result;
}


function controller($scope) {

    const vm = _.defaultsDeep(this, initData);

    vm.selectCapability = (cap) => {
        const currentIds = _.map(vm.selectedCapabilities, 'id');
        if (_.includes(currentIds, cap.id)) {
            // do nothing
        } else {
            vm.selectedCapabilities.unshift(cap);
        }
        vm.focusOnCapability(cap);
    };


    vm.removeCapability = (cap) => {
        vm.selectedCapabilities = _.reject(vm.selectedCapabilities, c => c.id === cap.id);
    };

    vm.focusOnCapability = (cap, desiredScore /* optional */) => {
        const scores = desiredScore
            ? _.filter(cap.details.cumulative, ({ appId, score }) => score === desiredScore)
            : cap.details.cumulative;

        vm.focusedApps = _.chain(scores)
            .uniqBy("appId")
            .map(({ appId, score }) => ({ score, ...vm.appsById[appId] }))
            .sortBy('name')
            .value();

        vm.focusedCapability = cap;
        vm.focusedScore = desiredScore;
        vm.visibility.appList = true;
    };


    $scope.$watchGroup(
        ['ctrl.appCapabilities', 'ctrl.capabilities', 'ctrl.ratings'],
        ([ appCapabilities, capabilities, ratings ]) => {
            if (appCapabilities && capabilities && ratings) {
                const data = build(capabilities, appCapabilities, ratings);
                vm.capabilityTree.data = data.treeData;
                vm.capabilityTree.appCountRange = data.appCountRange;
            }
        });


    $scope.$watch(
        'ctrl.applications',
        (apps) => vm.appsById = _.keyBy(apps, 'id'));

}

controller.$inject = [
    '$scope'
];


const directive = {
    restrict: 'E',
    replace: true,
    scope: {},
    bindToController: BINDINGS,
    controller,
    controllerAs: 'ctrl',
    template: require('./rating-explorer-section.html')
};


export default () => directive;