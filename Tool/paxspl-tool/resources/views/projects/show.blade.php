@extends('projects.app')
@section('content')
<div class="container">
    <div class="row justify-content-center">


        <div class="col-xs-12 col-sm-12 col-md-12">
            <div class="row">
            <p> <strong> Project: </strong> {{ $project->title }}</p>
            </div>


        </div>

        <div class="col-xs-12 col-sm-12 col-md-12">
            <div class="row">

            <p><strong>Description: </strong>
                {{ $project->description }} </p>

            </div>
        </div>
        <div class="col-xs-12 col-sm-12 col-md-12">
            <div class="row">
            <p>  <strong>Owner: </strong>
                {{ $project->user->name }} </p>
            </div>
        </div>
        <div class="row">

            <div class="card">

                <div class="card-header py-3">
                    <i class="fas fa-clipboard-list"></i> Initiation</div>

                <div class="card-body">



                    <a href="{{ route('projects.teams.index', $project -> id) }}" class="btn btn-success btn-icon-split">
                        <span class="icon text-white-50">
                            <i class="fas fa-user-friends"></i>
                        </span>
                        <span class="text">Collect Team Information </span>
                    </a>
                    <div class="my-2"></div>
                    <a href="{{ route('projects.artifact.index', $project -> id) }}" class=" btn btn-success btn-icon-split">
                        <span class="icon text-white-50">
                            <i class="fas fa-file-code"></i>
                        </span>
                        <span class="text">Register Artifacts</span>
                    </a>

 

                </div>
            </div>
            <div class="card">

                <div class="card-header py-3"><i class="fas fa-puzzle-piece"></i> Instantiation</div>

                <div class="card-body">



                    <a href="{{ route('projects.technique_projects.index', $project -> id) }}" class="btn btn-secondary btn-icon-split">
                        <span class="icon text-white-50">
                            <i class="fas fa-tasks"></i>
                        </span>
                        <span class="text">Select Techniques </span>
                    </a>
                    <div class="my-2"></div>
                    <a href="{{ route('projects.assemble_process.index', $project -> id) }}" class=" btn btn-secondary btn-icon-split">
                        <span class="icon text-white-50">
                            <i class="fas fa-puzzle-piece"></i>
                        </span>
                        <span class="text">Assemble Retrieval Process</span>
                    </a>
                    <div class="my-2"></div>
                    <a href="{{ route('projects.scoping_process.index', $project -> id) }}" class=" btn btn-secondary btn-icon-split">
                        <span class="icon text-white-50">
                            <i class="fas fa-puzzle-piece"></i>
                        </span>
                        <span class="text">Assemble Scoping Process</span>
                    </a>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header py-3"><i class="fas fa-play-circle"></i> Documentation</div>

            <div class="card-body">


                @if ($project->retriever())
                <a href="{{ route('projects.execute_f_process.index', $project -> id) }}" class="btn btn-info btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-play"></i>
                    </span>
                    <span class="text">Execute Retrieval Process </span>
                </a>

                <div class="my-2"></div>
                <a href="{{ route('projects.execute_s_process.index', $project -> id) }}" class=" btn btn-info btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-play"></i>
                    </span>
                    <span class="text">Execute Scoping Process</span>
                </a>
                @else
                <div class="my-2"></div>
                <a href="{{ route('projects.check_f_process.index', $project -> id) }}" class=" btn btn-info btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-check-double"></i>
                    </span>
                    <span class="text">Check Retrieval Process</span>
                </a>
                <div class="my-2"></div>
                <a href="{{ route('projects.check_s_process.index', $project -> id) }}" class=" btn btn-info btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-check-double"></i>
                    </span>
                    <span class="text">Check Scoping Process</span>
                </a>
                @endif
                




            </div>
        </div>
        <div class="card">
            <div class="card-header py-3"><i class="fas fa-chart-line"></i> Analysis</div>

            <div class="card-body">


                
                <div class="my-2"></div>
                <a href="{{ route('projects.feature_model.index', $project -> id) }}" class=" btn btn-danger btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-sitemap"></i>
                    </span>
                    <span class="text">Variability Management</span>
                </a>

                <div class="my-2"></div>
                <a href="{{ route('projects.exp_process.index', $project -> id) }}" class=" btn btn-danger btn-icon-split">
                    <span class="icon text-white-50">
                        <i class="fas fa-flag-checkered"></i>
                    </span>
                    <span class="text">Register Process Experience</span>
                </a>




            </div>
        </div>
    </div>

</div>

@endsection