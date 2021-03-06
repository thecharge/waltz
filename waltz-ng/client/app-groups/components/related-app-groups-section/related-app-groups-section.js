/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016, 2017 Waltz open source project
 * See README.md for more information
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


import _ from "lodash";

import template from "./related-app-groups-section.html";

import {initialiseData} from "../../../common/index";
import {CORE_API} from "../../../common/services/core-api-utils";
import {sameRef} from "../../../common/entity-utils";
import {isGroupOwner} from "../../app-group-utils";


const bindings = {
    parentEntityRef: '<'
};


const initialState = {
    currentlySelectedGroup: null,
    relationships: [],
    editable: false,
    mode: 'view', // edit | view
};


function canEdit(serviceBroker, entityRef) {
    switch(entityRef.kind){
        case 'APP_GROUP':
            return isGroupOwner(serviceBroker, entityRef);
        case 'CHANGE_INITIATIVE':
            return Promise.resolve(true);
        default:
            return Promise.resolve(false);
    }
}


function loadRelationshipData($q, serviceBroker, entityRef) {
    const relationshipPromise = serviceBroker
        .loadViewData(
            CORE_API.EntityRelationshipStore.findForEntity,
            [entityRef, 'ANY'],
            { force: true })
        .then(r => r.data);

    const groupPromise = serviceBroker
        .loadViewData(
            CORE_API.AppGroupStore.findRelatedByEntityRef,
            [ entityRef ],
            { force: true })
        .then(r => _
            .chain(r.data)
            .reject(relatedGroup => sameRef(relatedGroup, entityRef))
            .value());

    return $q
        .all([relationshipPromise, groupPromise])
        .then(([relationships, groups]) => {
            const groupsById = _.keyBy(groups, 'id');
            return _
                .chain(relationships)
                .map(rel => {
                    return sameRef(entityRef, rel.a)
                        ? {counterpartRef: rel.b, side: 'TARGET', relationship: rel}
                        : {counterpartRef: rel.a, side: 'SOURCE', relationship: rel};
                })
                .filter(rel => rel.counterpartRef.kind === 'APP_GROUP')
                .map(rel => Object.assign({}, rel, { counterpart: groupsById[rel.counterpartRef.id] }))
                .filter(rel => rel.counterpart != null)
                .uniqBy(rel => rel.counterpart.id)
                .orderBy("counterpart.name")
                .value();
        });
}


function canGroupBeProposed(relationships = [], proposedGroup, selfRef) {
    const proposalId = proposedGroup.id;
    const alreadyLinked = _
        .chain(relationships)
        .map('counterpart.id')
        .includes(proposalId)
        .value();

    return ! alreadyLinked && ! sameRef(proposedGroup, selfRef);
}


function controller($q, notification, serviceBroker) {
    const vm = initialiseData(this, initialState);

    const reload = () => loadRelationshipData($q, serviceBroker, vm.parentEntityRef)
        .then(r => vm.relationships = r);

    vm.$onInit = () => {
        reload();
        canEdit(serviceBroker, vm.parentEntityRef)
            .then(r => vm.editable = r);

    };


    vm.groupSelectionFilter = (proposedGroup) => canGroupBeProposed(
        vm.relationships,
        proposedGroup,
        vm.parentEntityRef);


    vm.onRemove = (rel) => {
        return serviceBroker
            .execute(CORE_API.EntityRelationshipStore.remove, [ rel ])
            .then(() => {
                notification.info("Relationship removed");
                reload();
            })
            .catch(e => notification.error("Failed to remove! " + e.message))
    };


    vm.onAdd = () => {
        if (vm.currentlySelectedGroup === null) {
            return;
        }

        const newRel = {
            a: vm.parentEntityRef,
            b: vm.currentlySelectedGroup,
            relationship: 'RELATES_TO'
        };

        return serviceBroker
            .execute(CORE_API.EntityRelationshipStore.create, [ newRel ])
            .then(() => {
                notification.info("Relationship created");
                vm.currentlySelectedGroup = null;
                reload();
            })
            .catch(e => notification.error("Failed to add! " + e.message))
    };


    vm.onGroupSelected = (g) => vm.currentlySelectedGroup = g;
    vm.onEdit = () => vm.mode = 'edit';
    vm.onCancel = () => vm.mode = 'view';
}


controller.$inject = [
    '$q',
    'Notification',
    'ServiceBroker'
];


const component = {
    controller,
    bindings,
    template
};


const id = 'waltzRelatedAppGroupsSection';


export default {
    id,
    component
}