/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016  Khartec Ltd.
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

package com.khartec.waltz.model.database_information;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.khartec.waltz.model.*;
import org.immutables.value.Value;

import java.util.Date;

import static com.khartec.waltz.model.EndOfLifeStatus.calculateEndOfLifeStatus;

@Value.Immutable
@JsonSerialize(as = ImmutableDatabaseInformation.class)
@JsonDeserialize(as = ImmutableDatabaseInformation.class)
public abstract class DatabaseInformation implements
        AssetCodeProvider,
        ProvenanceProvider,
        ExternalIdProvider {

    public abstract String databaseName();
    public abstract String instanceName();
    public abstract String environment();
    public abstract String dbmsName();
    public abstract String dbmsVersion();
    public abstract String dbmsVendor();
    public abstract LifecycleStatus lifecycleStatus();


    @Nullable
    public abstract Date endOfLifeDate();


    @Value.Derived
    public EndOfLifeStatus endOfLifeStatus() {
        return calculateEndOfLifeStatus(endOfLifeDate());
    }

}
